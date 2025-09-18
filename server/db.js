import mongoose from 'mongoose'

let connectionPromise = null
let gridfsBucket = null

export function connectMongo() {
  if (connectionPromise) return connectionPromise
  const url = process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/proctoring'
  const dbName = process.env.MONGO_DB || 'VideoProctor'
  connectionPromise = mongoose.connect(url, {
    autoIndex: true,
    dbName,
  }).then((conn) => {
    const db = conn.connection.db
    gridfsBucket = new mongoose.mongo.GridFSBucket(db, { bucketName: 'recordings' })
    return conn
  })
  return connectionPromise
}

export function getBucket() {
  if (!gridfsBucket) throw new Error('Mongo not connected; call connectMongo() first')
  return gridfsBucket
}

export default mongoose
