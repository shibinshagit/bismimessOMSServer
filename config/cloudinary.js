const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: 'dxishiq9x',        // Replace with your Cloudinary cloud name
  api_key: '314741878962386',              // Replace with your Cloudinary API key
  api_secret: 'rRnIywI9jvsCSw_wVgffP63XBVg',        // Replace with your Cloudinary API secret
});

module.exports = cloudinary;
