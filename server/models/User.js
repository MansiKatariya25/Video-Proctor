import mongoose from '../db.js'

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, index: true },
  passwordHash: { type: String, required: true },
  passwordSalt: { type: String, required: true },
  token: { type: String, index: true },
}, { timestamps: true })

const User = mongoose.models.User || mongoose.model('User', UserSchema)
export default User

