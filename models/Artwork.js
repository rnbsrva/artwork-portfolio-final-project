const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const artworkSchema = new Schema({
  name: {
    type: String,
    required: true,
    unique: true
  },
  description: {
    type: String,
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, { timestamps: true });

const Artwork = mongoose.model('Artwork', artworkSchema);

module.exports = Artwork;
