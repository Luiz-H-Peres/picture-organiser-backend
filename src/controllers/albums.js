const { getDbClient } = require("../services/database");
const { ObjectId } = require('mongodb');
const { baseController } = require("./baseController");
const sharp = require('sharp');
const ExifParser = require('exif-parser');

const getAlbumsController = async (req, res) => {
    return baseController({
        req,
        res,
        requiredAuth: true,
        async callback({ db, user }) {
            const albums = await db.collection('albums').find({ user_id: user.userId }).toArray();
            return albums;
        }
    });
}

const createAlbumController = async (req, res) => {
    return baseController({
        res,
        req,
        required: ['album_name'],
        requiredAuth: true,
        async callback({ db, body, user }) {

            const { album_name, description } = body;

            const newAlbum = {
                user_id: user.userId,
                album_name,
                description,
                created_at: new Date(),
                photos: [],
            };

            const album = await db.collection('albums').insertOne(newAlbum);

            // Return the album object
            return {
                ...newAlbum,
                _id: album.insertedId,
            };
        }
    });
}

const uploadPhotoController = async (req, res) => {
    return baseController({
        res,
        req,
        required: ['albumId'],
        requiredAuth: true,
        async callback({ db, body, user }) {

            const { albumId, description } = body;
            const { files } = req;

            if (!files || files.length === 0) {
                throw new Error({ message: 'No files uploaded', code: 400 });
            }

            // Process each file: validate, convert, extract metadata
            const photos = await Promise.all(
                files.map(async (file) => {
                    const fileType = file.mimetype;

                    if (!fileType.startsWith('image/')) {
                        throw new Error({ message: 'Invalid file type', code: 400 });
                    }

                    let metadata = await sharp(file.buffer).metadata();
                    metadata.description = description;
                    const base64Image = file.buffer.toString('base64');

                    if (metadata.exif) {
                        try {
                            const parser = ExifParser.create(metadata.exif);
                            const exifData = parser.parse();
                            metadata = {
                                ...metadata,
                                ...exifData,
                            };
                        } catch (error) {
                            console.error('Error parsing EXIF data:', error);
                        }
                    }

                    return {
                        _id: new ObjectId(),
                        url: `data:${fileType};base64,${base64Image}`,
                        metadata,
                    };
                })
            );

            const result = await db.collection('albums').updateOne(
                {
                    _id: new ObjectId(albumId),
                    user_id: user.userId,
                },
                { $push: { photos: { $each: photos } } }
            );

            if (result.modifiedCount === 0) {
                throw new Error({ message: 'Album not found or user does not have permission', code: 404 });
            }

            return result
        }
    });
}

const deletePhotoController = async (req, res) => {
    return baseController({
        req,
        res,
        required: ['albumId', 'photoId'],
        requiredAuth: true,
        async callback({ db, body, user }) {

            const { albumId, photoId } = body;

            // Find the album to ensure the user owns it
            const album = await db.collection('albums').findOne({
                _id: new ObjectId(albumId),
                user_id: req.user.userId,
            });

            if (!album) {
                throw new Error({ error: 'Album not found or unauthorized', code: 404 });
            }

            const photos = album.photos;
            const photoIndex = photos.findIndex((photo) => photo._id.toString() === photoId);

            if (photoIndex === -1) {
                throw new Error({ error: 'Photo not found in the album', code: 404 });
            }

            photos.splice(photoIndex, 1);

            const result = await db.collection('albums').updateOne(
                { _id: new ObjectId(albumId) },
                { $set: { photos } }
            );

            if (result.modifiedCount === 0) {
                throw new Error({ error: 'Failed to delete photo', code: 500 });
            }

            return { message: 'Photo deleted successfully' };
        }
    });


    // try {
    //     const db = await getDbClient();
    //     const { albumId, photoIndex } = req.params;



    //     if (!album) {
    //         return res.status(404).json({ error: 'Album not found or unauthorized' });
    //     }

    //     // Check if the photo index is valid
    //     if (photoIndex < 0 || photoIndex >= album.photos.length) {
    //         return res.status(400).json({ error: 'Invalid photo index' });
    //     }

    //     // Remove the photo from the album
    //     album.photos.splice(photoIndex, 1);

    //     // Update the album in the database
    //     await db.collection('albums').updateOne(
    //         { _id: new ObjectId(albumId) },
    //         { $set: { photos: album.photos } }
    //     );

    //     res.status(200).json({ message: 'Photo deleted successfully' });
    // } catch (error) {
    //     res.status(500).json({ error: 'Failed to delete photo' });
    // }
}

const deleteAlbumController = async (req, res) => {
    return baseController({
        req,
        res,
        required: ['albumId'],
        requiredAuth: true,
        async callback({ db, body, user }) {
            const { albumId } = body;

            const result = await db.collection('albums').deleteOne({
                _id: new ObjectId(albumId),
                user_id: user.userId,
            });

            if (result.deletedCount === 0) {
                throw new Error({ error: 'Album not found or unauthorized', code: 404 });
            }

            return { message: 'Album deleted successfully' };
        }
    })
};

const findPhotosByMetadataController = async (req, res) => {
    return baseController({
        req,
        res,
        required: ['query'],
        requiredAuth: true,
        async callback({ db, body, user }) {
            const { query } = body;

            // This query will search for albums where the album name, description, or any photo's metadata (description, format, or space) contains the query string.
            const result = await db.collection('albums').aggregate([
                {
                    $match: {
                        user_id: user.userId,
                        $or: [
                            { album_name: { $regex: query, $options: 'i' } },
                            { description: { $regex: query, $options: 'i' } },
                            { 'photos.metadata.description': { $regex: query, $options: 'i' } },
                            { 'photos.metadata.format': { $regex: query, $options: 'i' } },
                            { 'photos.metadata.space': { $regex: query, $options: 'i' } },
                        ]
                    }
                },
                {
                    $project: {
                        album_name: 1,
                        description: 1,
                        created_at: 1,
                        user_id: 1,
                        photos: {
                            $filter: {
                                input: "$photos",
                                as: "photo",
                                cond: {
                                    $or: [
                                        { $regexMatch: { input: "$$photo.metadata.description", regex: query, options: "i" } },
                                        { $regexMatch: { input: "$$photo.metadata.format", regex: query, options: "i" } },
                                        { $regexMatch: { input: "$$photo.metadata.space", regex: query, options: "i" } }
                                    ]
                                }
                            }
                        }
                    }
                }
            ]).toArray();

            return result;
        }
    });
}

module.exports = {
    getAlbumsController,
    createAlbumController,
    uploadPhotoController,
    deleteAlbumController,
    deletePhotoController,
    findPhotosByMetadataController
}