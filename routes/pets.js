// UPLOADING TO AWS S3
const multer  = require('multer');
const upload = multer({ dest: 'uploads/' });
const Upload = require('s3-uploader');
require('dotenv').config();
const mailer = require('../utils/mailer');

const client = new Upload(process.env.S3_BUCKET, {
  aws: {
    path: 'pets/avatar',
    region: process.env.S3_REGION,
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  },
  cleanup: {
    versions: true,
    original: true
  },
  versions: [{
    maxWidth: 400,
    aspect: '16:10',
    suffix: '-standard'
  },{
    maxWidth: 300,
    aspect: '1:1',
    suffix: '-square'
  }]
});

// MODELS
const Pet = require('../models/pet');

// PET ROUTES
module.exports = (app) => {

  // NEW PET
  app.get('/pets/new', (req, res) => {
    res.render('pets-new');
  });

  // CREATE PET
  app.post('/pets', upload.single('avatar'), async (req, res, next) => {
    let pet = new Pet(req.body);
    if (req.file) {
      // Upload the images
      await client.upload(req.file.path, {}, async function (err, versions, meta) {
        if (err) {
          console.log(err.message)
          return res.status(400).send({ err: err })
        };

        // Pop off the -square and -standard and just use the one URL to grab the image
        for (const image of versions) {
          let urlArray = image.url.split('-');
          urlArray.pop();
          let url = urlArray.join('-');
          pet.avatarUrl = url;
          await pet.save();
        }

        res.send({ pet: pet });
      });
    } else {
      await pet.save();
      res.send({ pet: pet });
    }
  })

  // SHOW PET
  app.get('/pets/:id', (req, res) => {
    Pet.findById(req.params.id).exec((err, pet) => {
      res.render('pets-show', { pet: pet });
    });
  });

  // EDIT PET
  app.get('/pets/:id/edit', (req, res) => {
    Pet.findById(req.params.id).exec((err, pet) => {
      res.render('pets-edit', { pet: pet });
    });
  });

  // UPDATE PET
  app.put('/pets/:id', (req, res) => {
    Pet.findByIdAndUpdate(req.params.id, req.body)
      .then((pet) => {
        res.redirect(`/pets/${pet._id}`)
      })
      .catch((err) => {
        // Handle Errors
      });
  });

  // DELETE PET
  app.delete('/pets/:id', (req, res) => {
    Pet.findByIdAndRemove(req.params.id).exec((err, pet) => {
      return res.redirect('/')
    });
  });

  // SEARCH PET
  app.get('/search', (req, res) => {
        const term = new RegExp(req.query.term, 'i')
        const page = req.query.page || 1
        Pet.paginate(
          {
            $or: [
              { 'name': term },
              { 'species': term }
            ]
          },
          { page: page }).then((results) => {
            res.render('pets-index', { pets: results.docs, pagesCount: results.pages, currentPage: page });
          });
      });

  // PURCHASE PET
  app.post('/pets/:id/purchase', (req, res) => {
    console.log(req.body);
    var stripe = require("stripe")(process.env.PRIVATE_STRIPE_API_KEY);
    const token = req.body.stripeToken; // Using Express
    // req.body.petId can become null through seeding,
    // this way we'll insure we use a non-null value
    let petId = req.body.petId || req.params.id;

    Pet.findById(petId).exec((err, pet)=> {
      if (err) {
        console.log('Error: ' + err);
        res.redirect(`/pets/${req.params.id}`);
      }
      const charge = stripe.charges.create({
        amount: pet.price * 100,
        currency: 'usd',
        description: `Purchased ${pet.name}, ${pet.species}`,
        source: token,
      }).then((chg) => {
        const user = {
          email: req.body.stripeEmail,
          amount: chg.amount / 100,
          petName: pet.name
        };
        mailer.sendMail(user, req, res);
      })
      .catch(err => {
        console.log('Error:' + err);
      });
    })

  });

}
