const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const artworkSchema = new Schema({
  name: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  downloadLinks:{
    type: mongoose.Schema.Types.Array
  }
}, { timestamps: true });

const Artwork = mongoose.model('Artwork', artworkSchema);

module.exports = Artwork;
