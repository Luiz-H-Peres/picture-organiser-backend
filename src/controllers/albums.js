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

            // 🟢 Debug logs to trace the request
            console.log("UploadPhotoController triggered");
            console.log("req.body:", body);
            console.log("req.files:", req.files);

            const { albumId, description } = body;
            const { files } = req;

            if (!files || files.length === 0) {
                const err = new Error('No files uploaded');
                err.code = 400;
                throw err;
            }

            const MAX_IMAGE_SIZE = 6 * 1024 * 1024; // 6MB safety margin under 16MB
            const photos = [];

            for (const file of files) {
                try {
                    const fileType = file.mimetype;

                    if (!fileType.startsWith('image/')) {
                        throw new Error('Invalid file type');
                    }

                    if (file.buffer.length > 15 * 1024 * 1024) {
                        throw new Error('Image is too large (max 15MB before processing)');
                    }

                    let metadata = {};
                    let optimizedImage;
                    let attempts = 0;
                    let currentQuality = 80;

                    while (attempts < 3) {
                        try {
                            const processor = sharp(file.buffer)
                                .rotate()
                                .resize({
                                    width: 1600,
                                    height: 1600,
                                    fit: 'inside',
                                    withoutEnlargement: true
                                });

                            optimizedImage = await processor
                                .jpeg({
                                    quality: currentQuality,
                                    progressive: true,
                                    mozjpeg: true
                                })
                                .toBuffer();

                            if (optimizedImage.length <= MAX_IMAGE_SIZE) break;

                            currentQuality -= 20;
                            attempts++;
                        } catch (processError) {
                            console.warn('Image processing attempt failed:', processError);
                            attempts++;
                            if (attempts >= 3) throw processError;
                        }
                    }

                    if (optimizedImage.length > MAX_IMAGE_SIZE) {
                        throw new Error(`Could not optimize image below ${MAX_IMAGE_SIZE / 1024 / 1024}MB`);
                    }

                    try {
                        metadata = await sharp(optimizedImage).metadata();
                        metadata.description = description;

                        if (metadata.exif && Buffer.isBuffer(metadata.exif)) {
                            const parser = ExifParser.create(metadata.exif);
                            const exifData = parser.parse();
                            metadata.make = exifData.tags?.Make || 'Unknown';
                            metadata.model = exifData.tags?.Model || 'Unknown';
                            metadata.created = exifData.tags?.DateTimeOriginal || new Date().toISOString();
                            metadata.orientation = exifData.tags?.Orientation || 'Unspecified';
                        }
                    } catch (metaError) {
                        console.warn('📷 Metadata extraction failed:', metaError.message);
                        metadata = {
                            description,
                            created: new Date().toISOString(),
                            note: 'Partial or failed metadata parse'
                        };
                    }

                    photos.push({
                        _id: new ObjectId(),
                        url: `data:image/jpeg;base64,${optimizedImage.toString('base64')}`,
                        metadata: JSON.parse(JSON.stringify(metadata)),
                        optimized: true,
                        quality: currentQuality,
                        originalSize: file.buffer.length,
                        optimizedSize: optimizedImage.length
                    });

                } catch (error) {
                    console.error(`Failed to process image: ${error.message}`);
                    throw error;
                }
            }

            const CHUNK_SIZE = 3;
            for (let i = 0; i < photos.length; i += CHUNK_SIZE) {
                const chunk = photos.slice(i, i + CHUNK_SIZE);
                const result = await db.collection('albums').updateOne(
                    {
                        _id: new ObjectId(albumId),
                        user_id: user.userId,
                    },
                    { $push: { photos: { $each: chunk } } }
                );

                if (result.modifiedCount === 0) {
                    throw new Error('Album not found or user does not have permission');
                }
            }

            return {
                success: true,
                uploaded: photos.length,
                details: photos.map(p => ({
                    id: p._id,
                    originalSize: p.originalSize,
                    optimizedSize: p.optimizedSize,
                    quality: p.quality
                }))
            };
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