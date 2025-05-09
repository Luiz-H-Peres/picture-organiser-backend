const { getDbClient } = require("../services/database");
const { ObjectId } = require('mongodb');
const { baseController } = require("./baseController");
const sharp = require('sharp');
const ExifParser = require('exif-parser');

// GET all albums for the authenticated user
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
};

// CREATE a new album
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

            return {
                ...newAlbum,
                _id: album.insertedId,
            };
        }
    });
};

// UPLOAD photo(s) to album
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
                const err = new Error('No files uploaded');
                err.code = 400;
                throw err;
            }

            const photos = await Promise.all(
                files.map(async (file) => {
                    const fileType = file.mimetype;

                    if (!fileType.startsWith('image/')) {
                        const err = new Error('Invalid file type');
                        err.code = 400;
                        throw err;
                    }

                    let metadata = await sharp(file.buffer).metadata();
                    metadata.description = description;
                    const base64Image = file.buffer.toString('base64');

                    if (metadata.exif && Buffer.isBuffer(metadata.exif)) {
                        try {
                            const parser = ExifParser.create(metadata.exif);
                            const exifData = parser.parse();
                            metadata = {
                                ...metadata,
                                make: exifData.tags?.Make,
                                model: exifData.tags?.Model,
                                created: exifData.tags?.DateTimeOriginal,
                                orientation: exifData.tags?.Orientation,
                            };
                        } catch (error) {
                            console.warn('📷 EXIF parse failed:', error.message);
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
                const err = new Error('Album not found or user does not have permission');
                err.code = 404;
                throw err;
            }

            return result;
        }
    });
};

// DELETE a photo from an album
const deletePhotoController = async (req, res) => {
    return baseController({
        req,
        res,
        required: ['albumId', 'photoId'],
        requiredAuth: true,
        async callback({ db, body, user }) {
            const { albumId, photoId } = body;

            const album = await db.collection('albums').findOne({
                _id: new ObjectId(albumId),
                user_id: req.user.userId,
            });

            if (!album) {
                const err = new Error('Album not found or unauthorized');
                err.code = 404;
                throw err;
            }

            const photoIndex = album.photos.findIndex((photo) => photo._id.toString() === photoId);

            if (photoIndex === -1) {
                const err = new Error('Photo not found in the album');
                err.code = 404;
                throw err;
            }

            album.photos.splice(photoIndex, 1);

            const result = await db.collection('albums').updateOne(
                { _id: new ObjectId(albumId) },
                { $set: { photos: album.photos } }
            );

            if (result.modifiedCount === 0) {
                const err = new Error('Failed to delete photo');
                err.code = 500;
                throw err;
            }

            return { message: 'Photo deleted successfully' };
        }
    });
};

// DELETE an entire album
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
                const err = new Error('Album not found or unauthorized');
                err.code = 404;
                throw err;
            }

            return { message: 'Album deleted successfully' };
        }
    });
};

// SEARCH photos by metadata text query
const findPhotosByMetadataController = async (req, res) => {
    return baseController({
        req,
        res,
        required: ['query'],
        requiredAuth: true,
        async callback({ db, body, user }) {
            const { query } = body;

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
};

module.exports = {
    getAlbumsController,
    createAlbumController,
    uploadPhotoController,
    deleteAlbumController,
    deletePhotoController,
    findPhotosByMetadataController
};
