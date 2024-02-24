const nodemailer = require('nodemailer');

async function sendEmail(to, subject, text) {
    try {
         // Create a transporter object using SMTP transport
         const transporter = nodemailer.createTransport({
           service: 'Gmail',
           tls: {
             rejectUnauthorized: false,
           },
           auth: {
               user: process.env.SMTP_EMAIL, 
               pass: process.env.SMTP_PASSWORD 
           },
           secure: true,
       });
   
         // Define email options
         const mailOptions = {
           from: process.env.SMTP_EMAIL,
             to: to, 
             subject: subject, 
             text: text
         };
   
         // Send email
         const info = await transporter.sendMail(mailOptions);
         console.log('Email sent:', info.response);
     } catch (error) {
         console.error('Error occurred:', error);
     }
 }
 
 async function sendGreeting(to, firstName) {
   try {
        // Create a transporter object using SMTP transport
        const transporter = nodemailer.createTransport({
          service: 'Gmail',
          tls: {
            rejectUnauthorized: false,
          },
          auth: {
              user: process.env.SMTP_EMAIL, 
              pass: process.env.SMTP_PASSWORD 
          },
          secure: true,
      });
  
        // Define email options
        const mailOptions = {
          from: process.env.SMTP_EMAIL,
            to: to, 
            subject: "Welcome to my app", 
            html: `<b>Welcome to My Portfolio App!</b><br>
               <p>Dear ${firstName} </p>
               <p>Thank you for joining Portfolio App. We're excited to have you on board!</p>
               <p>Feel free to explore and share your thoughts with the community.</p>
               <p>Best regards.</p>
               <p>From Akerke</p>`,
        };
  
        // Send email
        const info = await transporter.sendMail(mailOptions);
        console.log('Email sent:', info.response);
    } catch (error) {
        console.error('Error occurred:', error);
    }
 }
 
 
 async function sendNotification(to, firstName) {
   try {
        // Create a transporter object using SMTP transport
        const transporter = nodemailer.createTransport({
          service: 'Gmail',
          tls: {
            rejectUnauthorized: false,
          },
          auth: {
              user: process.env.SMTP_EMAIL, 
              pass: process.env.SMTP_PASSWORD 
          },
          secure: true,
      });
  
        // Define email options
        const mailOptions = {
          from: process.env.SMTP_EMAIL,
            to: to, 
            subject: "New Artwork Added", 
            html: `<b> New Artwork Added to Your Page!</b><br>
               <p>Dear ${firstName} </p>
               <p>We're thrilled to inform you that a new artwork has been successfully added to your page! This exciting addition enriches your portfolio and enhances your online presence.</p>
               <p>Thank you for choosing our platform to showcase your talent. If you have any questions or need further assistance, please don't hesitate to reach out to us.</p>
               <p>Best regards.</p>
               <p>From Akerke</p>`,
        };
  
        // Send email
        const info = await transporter.sendMail(mailOptions);
        console.log('Email sent:', info.response);
    } catch (error) {
        console.error('Error occurred:', error);
    }
 }
 
 module.exports = { sendEmail, sendGreeting, sendNotification };