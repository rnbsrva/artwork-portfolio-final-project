const express = require('express');
const bcrypt = require('bcrypt')
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser')
const { sendEmail, sendGreeting, sendNotification } = require('./emailService');
const mongoose = require('./db');
const User = require('./models/User');
const Artwork = require('./models/Artwork');
const uuid = require('uuid')
const dotenv = require("dotenv")
const multer = require('multer');
const fs = require('fs');
const upload = multer({ dest: 'uploads/' });
const axios = require('axios');
const moment = require('moment');
var cors = require('cors');

dotenv.config()

const Minio = require("minio");
const minioClient = new Minio.Client({
  accessKey: process.env.ACCESS_KEY,
  port: 9000,
  useSSL: false,
  secretKey: process.env.SECRET_KEY,
  endPoint: process.env.ENDPOINT,
});

minioClient.listBuckets(function(err, buckets) {
  if (err) {
    console.log("Error occurred:", err);
  } else {
    console.log("Successfully connected to Minio. Buckets:", buckets);
  }
});

class Session {
  constructor(username, expiresAt) {
      this.username = username
      this.expiresAt = expiresAt
  }

  isExpired() {
      this.expiresAt < (new Date())
  }
}

const sessions = {}

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(cookieParser());
app.use(cors())
  
app.post('/register', async (req, res) => {
    console.log(req.body);

    const {username, firstName, lastName, country, age, email, password } = req.body;
    try {
        // Check if the user already exists
        const existingUser = await User.findOne({ username });
        if (existingUser) {
                return res.status(400).send('User already exists');
        }

        const existingUser2 = await User.findOne({ email });
        if (existingUser2) {
                return res.status(400).send('User already exists');

            }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ username, firstName, lastName, country, age, email, password : hashedPassword, role: "user" });
        await newUser.save();
        sendGreeting(email, newUser.firstName);

        const sessionToken = uuid.v4()
        const now = new Date()
        const expiresAt = new Date(+now + 120 * 1000)
        const session = new Session(username, expiresAt)
        sessions[sessionToken] = session
        res.setHeader('x-session-token', sessionToken);
        res.setHeader('x-session-token-expiration', expiresAt);
        res.json({user:newUser,sessionToken })
        res.end();
      } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
      }
  
  });

  app.post('/login', async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
      }
  
      const user = await User.findOne({ username });
      const passwordMatch = await bcrypt.compare(password, user.password);
      if (!passwordMatch) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
  
      const sessionToken = uuid.v4()

      const now = new Date()
      const expiresAt = new Date(+now + 900 * 1000)
      const session = new Session(username, expiresAt)
      sessions[sessionToken] = session
      res.setHeader('x-session-token', sessionToken);
      res.setHeader('x-session-token-expiration', expiresAt);
      res.status(200).json({user,sessionToken })
      res.end();
    } catch (error) { 
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });


app.post('/logout', async (req, res) => {
    if (!req.headers) {
        res.status(401).end();
        return;
    }

    const sessionToken = req.headers['x-session-token'];
    if (!sessionToken) {
        res.status(401).end();
        return;
    }

    delete sessions[sessionToken];

    // No need to clear cookies in the response
    res.end();
});

app.post('/refresh', async (req, res) => {
  if (!req.headers) {
      res.status(401).end();
      return;
  }

  const sessionToken = req.headers['x-session-token'];
  if (!sessionToken) {
      res.status(401).end();
      return;
  }

  const userSession = sessions[sessionToken];
  if (!userSession) {
      res.status(401).end();
      return;
  }

  if (userSession.isExpired()) {
      delete sessions[sessionToken];
      res.status(401).end();
      return;
  }

  const newSessionToken = uuid.v4();

  const now = new Date();
  const expiresAt = new Date(+now + 120 * 1000);
  const session = new Session(userSession.username, expiresAt);

  sessions[newSessionToken] = session;
  delete sessions[sessionToken];

  // Set the new session token in the response header
  res.setHeader('x-session-token', newSessionToken);
  res.status(200).end();
});



  const isAuthenticated = (req) => {
    if (!req.headers) {
        console.log("No headers");
        return false;
    }

    const sessionToken = req.headers['x-session-token'];
    if (!sessionToken) {
        console.log("No session token in headers");
        return false;
    }

    const userSession = sessions[sessionToken];
    if (!userSession) {
        console.log("Invalid session token");
        return false;
    }

    if (userSession.isExpired()) {
        delete sessions[sessionToken];
        console.log("Session token expired");
        return false;
    }

    return true;
};



  

app.post('/artworks',  upload.fields([{ name: 'file1' }, { name: 'file2' }, { name: 'file3' }]), async (req, res) => {
  try {
    if (!isAuthenticated(req)) {
      res.status(401).end();
      return;
  }
  const sessionToken = req.headers['x-session-token'];
  const userSession = sessions[sessionToken];

  const user = await User.findOne({ username: userSession.username });

  if (!user) {
    console.log("User not found");
    return res.status(404).json({ error: 'User not found' });
  }
  if(user.role!="admin"){
    return res.status(403).json({ error: 'Forbidden action' });
  }

    const name  = req.query.name;
    const description = req.query.description;
    if (!name) {
      console.log("Name is required");
      return res.status(400).json({ error: 'Name is required' });
    }

    const artwork = new Artwork({ name, description, user: user._id });
    const savedArtwork = await artwork.save();
    sendNotification(user.email, user.firstName);
    const files = req.files;

  const bucketName = `${savedArtwork._id}`;
  minioClient.makeBucket(bucketName, '', function(err) {
      if (err) {
          return console.log('Error creating bucket: ', err);
      }

      console.log('Bucket created successfully');
      
      Object.keys(files).forEach((key) => {
          const photo = files[key][0];
          const filePath = photo.path;
          const fileName = `${key}.jpg`;

          minioClient.fPutObject(bucketName, fileName, filePath, (err, etag) => {
              if (err) {
                  return console.log('Error uploading photo: ', err);
              }

              console.log('Photo uploaded successfully: ', etag);
              fs.unlinkSync(filePath);
          });
      });
    });
    res.status(201).json(savedArtwork);
  } catch (error) {
    console.log(error)
    res.status(500).json({ error});
  }
});


app.get('/artworks', async (req, res) => {
  if (!isAuthenticated(req)) {
      res.status(401).end();
      return;
  }

  console.log("authenticated");

  try {
      const artworks = await Artwork.find();

      if (artworks.length === 0) { // If there are no artworks, end the request immediately
          res.status(200).json([]);
          return;
      }

      // Create an array to hold all promises for fetching download links
      const promises = artworks.map(async (artwork) => {
          try {
              const bucketName = `${artwork._id}`;
              const photosStream = minioClient.listObjects(bucketName);
              const photos = [];

              photosStream.on('data', (obj) => {
                  console.log("new photo");
                  photos.push(obj);
              });

              photosStream.on('error', (err) => {
                  console.error(`Error fetching photos for artwork ${artwork._id}: ${err}`);
                  return [];
              });

              // Wait for all photos to be fetched
              await new Promise((resolve, reject) => {
                  photosStream.on('end', resolve);
              });

              // Populate downloadLinks after all photos are fetched
              artwork.downloadLinks = await Promise.all(photos.map(async (photo) => {
                  try {
                      const presignedUrl = await minioClient.presignedGetObject(bucketName, photo.name, 60 * 60 * 24);
                      console.log(presignedUrl);
                      return presignedUrl;
                  } catch (error) {
                      console.error(`Error generating presigned URL for photo ${photo.name}: ${error}`);
                      return []; // or handle error differently
                  }
              }));
          } catch (error) {
              console.error(`Error fetching photos for artwork ${artwork._id}: ${error}`);
              artwork.downloadLinks = []; // Or set it to null or handle error differently
          }
      });

      // Wait for all promises to resolve before sending the response
      await Promise.all(promises);

      // After processing all artworks and populating downloadLinks, send the response
      res.status(200).json(artworks);
  } catch (error) {
      res.status(500).json({ error: error });
  }
});




app.get('/artworks/:id', async (req, res) => {

   if (!isAuthenticated(req)) {
      res.status(401).end();
      return;
  }
  try {
    const artwork = await Artwork.findById(req.params.id);
    if (!artwork) {
      return res.status(404).json({ error: 'Artwork not found' });
    }

    const bucketName = `${artwork._id}`;
    const photos = await new Promise((resolve, reject) => {
      const photosStream = minioClient.listObjects(bucketName);
      const photosList = [];

      photosStream.on('data', (obj) => {
        photosList.push(obj);
      });

      photosStream.on('error', (err) => {
        console.error(`Error fetching photos for artwork ${artwork._id}: ${err}`);
        resolve(photosList);
      });

      photosStream.on('end', () => {
        resolve(photosList);
      });
    });

    artwork.downloadLinks = await Promise.all(photos.map(async (photo) => {
      try {
        const presignedUrl = await minioClient.presignedGetObject(bucketName, photo.name, 60*60*24);
        return presignedUrl;
      } catch (error) {
        console.error(`Error generating presigned URL for photo ${photo.name}: ${error}`);
        return null; // or handle error differently
      }
    }));

    res.json(artwork);
  } catch (error) {
    console.error(`Error fetching artwork ${req.params.id}: ${error}`);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


// Update a task by ID
app.put('/artworks/:id', async (req, res) => {

  if (!isAuthenticated(req)) {
    res.status(401).end();
    return;
}

  const sessionToken = req.headers['x-session-token'];
  const userSession = sessions[sessionToken];

  const user = await User.findOne({ username: userSession.username });

  if (!user) {
    console.log("User not found");
    return res.status(404).json({ error: 'User not found' });
  }


  if(user.role!="admin"){
    return res.status(403).json({ error: 'Forbidden action' });
  }

  try {
    const { name, description } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const artwork = await Artwork.findById(req.params.id);
    if (!artwork) {
      return res.status(404).json({ error: 'Artwork not found' });
    }

    const updatedArtwork = await Artwork.findByIdAndUpdate(
      req.params.id,
      { name, description, user: user._id },
      { new: true }
    );

    res.json(updatedArtwork);
  } catch (error) {
    console.log(error)
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


// Delete a task by ID
app.delete('/artworks/:id', async (req, res) => {
  if (!isAuthenticated(req)) {
    res.status(401).end();
    return;
}

  const sessionToken = req.headers['x-session-token'];
  const userSession = sessions[sessionToken];
  const user = await User.findOne({ username: userSession.username });

  if (!user) {
    console.log("User not found");
    return res.status(404).json({ error: 'User not found' });
  }

  if (user.role !== "admin") {
    return res.status(403).json({ error: 'Forbidden action' });
  }

  try {
    const artwork = await Artwork.findById(req.params.id);
    if (!artwork) {
      return res.status(404).json({ error: 'Artwork not found' });
    }

    const bucketName = `${artwork._id}`;
    const objectsStream = minioClient.listObjects(bucketName);
    const objectsToDelete = [];

    objectsStream.on('data', (obj) => {
      objectsToDelete.push(obj.name);
    });

    objectsStream.on('end', () => {
      if (objectsToDelete.length > 0) {
        minioClient.removeObjects(bucketName, objectsToDelete, (err) => {
          if (err) {
            console.error(`Error removing objects from bucket ${bucketName}: ${err}`);
            return res.status(500).json({ error: 'Error removing objects from bucket' });
          }
          minioClient.removeBucket(bucketName, (err) => {
            if (err) {
              console.error(`Error removing bucket ${bucketName}: ${err}`);
              return res.status(500).json({ error: 'Error removing bucket' });
            }
            console.log(`Bucket ${bucketName} and its objects deleted successfully`);

            Artwork.findByIdAndDelete(req.params.id)
              .then((deletedArtwork) => {
                if (!deletedArtwork) {
                  return res.status(404).json({ error: 'Artwork not found' });
                }
                res.status(204).send();
              })
              .catch((err) => {
                console.error(`Error deleting artwork ${req.params.id}: ${err}`);
                res.status(500).json({ error: 'Error deleting artwork' });
              });
          });
        });
      } else {
        minioClient.removeBucket(bucketName, (err) => {
          if (err) {
            console.error(`Error removing bucket ${bucketName}: ${err}`);
            return res.status(500).json({ error: 'Error removing bucket' });
          }
          console.log(`Bucket ${bucketName} deleted successfully`);

          Artwork.findByIdAndDelete(req.params.id)
            .then((deletedArtwork) => {
              if (!deletedArtwork) {
                return res.status(404).json({ error: 'Artwork not found' });
              }
              res.status(204).send();
            })
            .catch((err) => {
              console.error(`Error deleting artwork ${req.params.id}: ${err}`);
              res.status(500).json({ error: 'Error deleting artwork' });
            });
        });
      }
    });

    objectsStream.on('error', (err) => {
      console.error(`Error listing objects in bucket ${bucketName}: ${err}`);
      return res.status(500).json({ error: 'Error listing objects in bucket' });
    });
  } catch (error) {
    console.error(`Error fetching artwork ${req.params.id}: ${error}`);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});




app.put('/artworks/updatePhotos/:artworkId', upload.fields([{ name: 'file1' }, { name: 'file2' }, { name: 'file3' }]), async (req, res) => {


  if (!isAuthenticated(req)) {
    res.status(401).end();
    return;
}

  const sessionToken = req.headers['x-session-token'];
  const userSession = sessions[sessionToken];
  const user = await User.findOne({ username: userSession.username });

  if (!user) {
    console.log("User not found");
    return res.status(404).json({ error: 'User not found' });
  }


  if(user.role!="admin"){
    return res.status(403).json({ error: 'Forbidden action' });
  }


  const artworkId = req.params.artworkId;
  const files = req.files;

  const bucketName = `${artworkId}`;

  Object.keys(files).forEach((key) => {
      const photo = files[key][0]; 
      const filePath = photo.path;
      const fileName = `${key}.jpg`; 
      minioClient.fPutObject(bucketName, fileName, filePath, (err, etag) => {
          if (err) {
              return console.log('Error uploading photo: ', err);
          }

          console.log('Photo uploaded successfully: ', etag);
          fs.unlinkSync(filePath);
      });
  });

  res.status(201).send();
});



//example http://localhost:2912/getHospitalizedCounts?date=2020-04-08
//not secured endpoint
app.get('/getHospitalizedCounts', async (req, res) => {

  if (!isAuthenticated(req)) {
    res.status(401).end();
    return;
}


  try {
      const { date } = req.query;
      const startDate = moment(date, 'YYYYMMDD'); 
      const hospitalizedCounts = [];

      for (let i = 0; i < 10; i++) {
          const currentDate = startDate.clone().subtract(i, 'days');
          const formattedDate = currentDate.format('YYYYMMDD');
          const apiUrl = `https://api.covidtracking.com/v1/us/${formattedDate}.json`;

          const response = await axios.get(apiUrl);
          const hospitalizedCount = response.data.hospitalized;

          hospitalizedCounts.push({
              date: formattedDate,
              hospitalized: hospitalizedCount
          });
      }

      res.json(hospitalizedCounts);
  } catch (error) {
      console.error('Error fetching hospitalized counts: ', error);
      res.status(500).json({ error: 'Internal Server Error' });
  }
});




app.post('/population', async (req, res) => {


  if (!isAuthenticated(req)) {
    res.status(401).end();
    return;
}

  try {
      const { yearFrom, yearTo } = req.body;

      const apiUrl = `https://datausa.io/api/data?drilldowns=Nation&measures=Population`;
      const response = await axios.get(apiUrl);
      const data = response.data.data;

      const filteredData = data.filter(item => {
          const year = parseInt(item.Year);
          return year >= parseInt(yearFrom) && year <= parseInt(yearTo);
      });

      const result = filteredData.map(item => ({
          Year: item.Year,
          Population: item.Population
      }));

      res.json(result);
  } catch (error) {
      console.error('Error fetching data:', error);
      res.status(500).json({ error: 'Failed to fetch data' });
  }
});



const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});