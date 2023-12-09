const express = require('express')
const cors = require('cors');
const app = express();
const port = 4000
require('dotenv').config();
const jwt = require('jsonwebtoken');
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
console.log(process.env.STRIPE_SECRET_KEY);


// middle Ware
app.use(cors());
app.use(express.json());

// verify access using jwt

const { MongoClient, ServerApiVersion } = require('mongodb');


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.9wuifze.mongodb.net/?retryWrites=true&w=majority`;


// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


   //collections in database
   const classesCollection = client.db("click-master").collection("classes");
   const instructorsCollection = client.db("click-master").collection("instructors");
   const usersCollection = client.db("click-master").collection("users");
   const selectedClassCollection = client.db("click-master").collection("selectedClasses");
   const paymentsCollection = client.db("click-master").collection("payments");
 

 const verifyJWT = (req, res, next) => {
    const authorization = req.headers.authorization;
    //send error msg if no authorization token 
    if (!authorization) {
        return res.status(401).send({ error: true, message: 'unauthorized access' });
    }
    //get the access token
    const token = authorization.split(' ')[1];

    //verify token with jwt 
    jwt.verify(token, process.env.ACCESS_TOKEN, (err, decoded) => {
        // send error if token is no valid 
        if (err) {
            return res.status(401).send({ error: true, message: 'unauthorized access' });
        }
        // the request information decoded and it put to req and send to next 
        req.decoded = decoded;
        next();
    });
}

//verify User email
const verifyUser = (req, res, next) => {
    const email = req.query.email;
    if (!email) {
        res.send([]);
    }
    const decodedEmail = req.decoded.email;
    //check for api req user is valid user
    if (decodedEmail !== email) {
        res.status(403).send({ error: true, message: "Forbidden access" })
    }
    req.email = email;
    next()
}

//verify admin role
const verifyAdmin = async (req, res, next) => {
    const email = req.decoded.email;
    const query = { email: email };
    const user = await usersCollection.findOne(query);
    if (user?.role !== 'admin') {
        return res.status(403).send({ error: true, message: 'forbidden access' })
    }
    req.user = user;
    next();
}
 
 
 
 
 app.post('/jwt', (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN, { expiresIn: '1h' })
            res.send({ token });
        })

     
        /*--------------------
        user data related apis
        ---------------------*/

        //add user info
        app.post('/users', async (req, res) => {
            const user = req.body;
            const query = { email: user.email };
            const existingUser = await usersCollection.findOne(query);
            if (existingUser) {
                return res.send({ message: 'user already exists' })
            }
            const result = await usersCollection.insertOne(user);
            res.send(result);
        })

        //get all user data 
        app.get('/users', verifyJWT, async (req, res) => {
            const result = await usersCollection.find().toArray();
            res.send(result);
        })

        //update user role
        app.patch('/users', verifyJWT, async (req, res) => {
            const { email, role } = req.body;
            const filter = { email: email };
            const updateRole = {
                $set: {
                    role: role
                }
            }
            const result = await usersCollection.updateOne(filter, updateRole);
            res.send(result);
        })

        //get user role
        app.get('/users/role/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;

            if (req.decoded.email !== email) {
                return res.send({ error: true, message: 'forbidden access' })
            }
            const query = { email: email }
            const user = await usersCollection.findOne(query);
            const result = user?.role;
            res.send(result);
        })


        /*--------------------
        class related apis
        ---------------------*/

        // get all class data
        app.get('/classes', async (req, res) => {
            const result = await classesCollection.find().toArray();
            res.send(result)
        })

        //get top 6 class data based on enrolled number
        app.get('/classes/top', async (req, res) => {
            const sort = { enrolled: -1 };
            const result = await classesCollection.find().sort(sort).limit(6).toArray();
            res.send(result)
        })

        //add new class
        //instructor
        app.post('/classes', verifyJWT, async (req, res) => {
            const newClass = req.body;
            const result = await classesCollection.insertOne(newClass);
            res.send(result);
        })

        //get added class 
        //instructor
        app.get('/classes/instructor', verifyJWT, verifyUser, async (req, res) => {
            const email = req.email;
            const query = { email: email };
            const result = await classesCollection.find(query).toArray();
            res.send(result)

        })

        //send feedback
        //admin
        app.patch('/classes', verifyJWT, async (req, res) => {
            const { feedback, id } = req.body;
            const filter = { _id: new ObjectId(id) };
            const updateFeedback = {
                $set: {
                    feedback: feedback
                }
            }

            const result = await classesCollection.updateOne(filter, updateFeedback);
            res.send(result);
        })

        //set class status
        //admin
        app.patch('/classes/status', verifyJWT, async (req, res) => {
            const { status, id } = req.body;
            const filter = { _id: new ObjectId(id) };
            const updateStatus = {
                $set: {
                    status: status
                }
            }
            const result = await classesCollection.updateOne(filter, updateStatus);
            res.send(result);
        })

        //enrolled class
        //student / user
        app.get('/enrolled', verifyJWT, verifyUser, async (req, res) => {
            const email = req.email;
            const query = { email: email };
            const payment = await paymentsCollection.find(query).toArray();
            const classIds = payment.map(item => new ObjectId(item.classId));
            const result = await classesCollection.find({ _id: { $in: classIds } }).toArray();
            res.send(result);
        })



        /*--------------------
        Instructors data related apis
        ---------------------*/

        //get all instructor data
        app.get('/instructors', async (req, res) => {
            const result = await instructorsCollection.find().toArray();
            res.send(result);
        })

        //get top 6 six instructor data
        app.get('/instructors/top', async (req, res) => {
            const result = await instructorsCollection.find().limit(6).toArray();
            res.send(result)
        })

        /*--------------------
        selected class / cart data related apis
        Students
        ---------------------*/

        //add selected class item for student dashboard
        app.post('/classes/selected', async (req, res) => {
            const item = req.body;
            const result = await selectedClassCollection.insertOne(item);
            res.send(result);
        })

        //get selected class item
        app.get('/classes/selected', verifyJWT, verifyUser, async (req, res) => {
            const query = { email: req.email }; // sending req.email from verifyUser
            const result = await selectedClassCollection.find(query).toArray();
            res.send(result);
        })

        // delete selected class item
        app.delete('/classes/selected/:id', verifyJWT, verifyUser, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await selectedClassCollection.deleteOne(query);
            res.send(result);
        })

        /*------------------
        Payment related apis
        --------------------*/

        // payment request to stripe server 
        app.post('/create-payment-intent', verifyJWT, async (req, res) => {
            const { price } = req.body;
            const paymentIntent = await stripe.paymentIntents.create({
                amount: price * 100,
                currency: "usd",
                "payment_method_types": [
                    "card"
                ],
            });
            console.log(paymentIntent)
            res.send({
                clientSecret: paymentIntent.client_secret
            })
        })

        //add payment details to db
        app.post('/payments', verifyJWT, async (req, res) => {
            const payment = req.body;
            //remove item form selected class
            const filter = { _id: new ObjectId(payment.selectedId) }
            await selectedClassCollection.deleteOne(filter);

            //changing available seats and enrolled number
            //find the class
            const query = { _id: new ObjectId(payment.classId) }
            const selectedClass = await classesCollection.findOne(query);
            console.log(selectedClass.enrolled);
            //update the class
            const updateClass = {
                $set: {
                    enrolled: selectedClass.enrolled + 1,
                    availableSeats: selectedClass.availableSeats - 1
                }
            }
            await classesCollection.updateOne(query, updateClass)
            //add payment information
            const result = await paymentsCollection.insertOne(payment);
            res.send(result);
        })

        //payment history
        app.get('/payments', verifyJWT, verifyUser, async (req, res) => {
            const email = req.email;
            const query = { email: email };
            const options = {
                sort: { date: -1 }
            }
            const result = await paymentsCollection.find(query, options).toArray(); 
            res.send(result);
        })

//comment end

app.get('/', (req, res) => {
    res.send('Click Master server is running')
})

app.listen(port, () => {
    console.log(`Click Master server is running on port ${port}`)
})



