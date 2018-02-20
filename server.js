const express = require("express");
const app = express();
const bodyparser = require("body-parser");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const JwtStrategy = require("passport-jwt").Strategy;
const ExtractJwt = require("passport-jwt").ExtractJwt;
const moment = require("moment");
const Entry = require("./models/Entry");
const User = require("./models/User");
var config = require("./config");
var port = process.env.PORT || 5000;
const server = require("http").Server(app);
const io = require("socket.io")(server);

app.use(bodyparser.json());
// io.on("connection", client => {
//   client.on("subscribeToTimer", interval => {
//     console.log("client is subscribing to timer with interval ", interval);
//     setInterval(() => {
//       client.emit("timer", new Date());
//     }, interval);
//   });
// });

// Configure Passport to use local strategy for initial authentication.
passport.use("local", new LocalStrategy(User.authenticate()));

var options = {};
options.jwtFromRequest = ExtractJwt.fromAuthHeaderWithScheme("jwt");
options.secretOrKey = "5x0klet&ughf;9(czmX6";

// Configure Passport to use JWT strategy to look up Users.
passport.use(
  "jwt",
  new JwtStrategy(options, function(jwt_payload, done) {
    User.findOne(
      {
        _id: jwt_payload.id
      },
      function(err, user) {
        if (err) {
          return done(err, false);
        }
        if (user) {
          done(null, user);
        } else {
          done(null, false);
        }
      }
    );
  })
);

// Connect to DB
var mongoDB = process.env.MONGODB_URI || "mongodb://localhost/checkinDB";
mongoose.connect(mongoDB);
var db = mongoose.connection;
db.on("error", console.error.bind(console, "connection error:"));
db.once("open", function() {
  // we're connected!
});

//Enabling CORS
app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  next();
});

app.get("/", function(req, res) {
  res.send("Check In App");
});

app.get("/test", function(req, res) {
  res.send(mongoDB);
});

// Route to view logs. For admin dashboard
app.get("/logs", function(req, res) {
  Entry.find({}, (err, allEntries) => {
    if (err) {
      console.log(err);
    } else {
      res.send(allEntries);
    }
  });
});

// Register a new user/employee
app.post("/register", function(req, res) {
  User.register(
    new User({ username: req.body.username }),
    req.body.password,
    function(err, user) {
      if (err) {
        return res.status(400).send({ error: err });
      }
      res.status(200).send({ user: user.id });
    }
  );
});

// Login to app
app.post("/login", function(req, res, next) {
  passport.authenticate("local", function(err, user, info) {
    if (err) {
      return next(err);
    }
    if (!user) {
      return res.status(401).json({ error: "Username/Password is invalid." });
    }
    if (user) {
      var token = jwt.sign(
        { id: user._id, username: user.username },
        options.secretOrKey
      );
      return res.status(200).json({ token });
    }
  })(req, res, next);
});

// Check in. Logs employee name, user ID, check in time and location
app.post("/checkin", function(req, res, next) {
  //authentication for user using token
  passport.authenticate("jwt", function(err, user, info) {
    if (err) {
      // internal server error occurred
      return next(err);
    }
    if (!user) {
      // no JWT or user found
      return res.status(401).json({ error: err });
    }
    if (user) {
      // authentication was successful! send user the secret code.

      //get user info from form
      var userId = user._id;
      var name = req.body.name;
      var timeIn = req.body.time;
      var location = req.body.location;
      var today = moment().format("YYYY-MM-DD");

      //Check to see if user is already checked in. If yes, do nothing.
      //If not, create a new check in entry for user
      Entry.findOne(
        {
          userId: userId,
          timeIn: { $gte: new Date(today) },
          isCheckedIn: true
        },
        (err, entry) => {
          if (err) {
            console.log(err);
          }
          if (!entry) {
            Entry.create(
              {
                userId,
                name,
                timeIn,
                location,
                isCheckedIn: true,
                date: today
              },
              function(err, newEntry) {
                if (err) {
                  console.log(err);
                } else {
                  io.emit("entry", { entry: "created" });
                  console.log("Entry created!");
                  return res
                    .status(200)
                    .json({ error: null, entryId: newEntry._id });
                }
              }
            );
          }
          if (entry) {
            return res
              .status(500)
              .json({ error: "User already checked in", entryId: entry._id });
            // // Trying to check in at the same location
            // if(res.location === location && res.timeOut === null) {
            //   return res.status(500).json({error: "User already checked in at this location"});
            // }
            // // Trying to check in at a different location, but didn't check out of the last location
            // if(res.location !== location && res.timeOut === null) {
            //   return res.status(500).json({error: "User did not check out of last location"});
            //}
          }
        }
      );
    }
  })(req, res, next);
});

// Check out. Logs time of employee check out. Finds user entry using user ID
// and adds a check out time to the entry
app.post("/checkout", function(req, res, next) {
  passport.authenticate("jwt", function(err, user, info) {
    if (err) {
      // internal server error occurred
      return next(err);
    }
    if (!user) {
      // no JWT or user found
      return res.status(401).json({ error: err });
    }
    if (user) {
      var userId = user._id;
      var timeOut = req.body.time;
      var location = req.body.location;
      var entryId = req.body.entryId;
      //Find entry for user and update it with check out time
      Entry.findOne({ userId: userId, isCheckedIn: true }, (err, entry) => {
        if (err) {
          console.log(err);
          return res.status(500).json({ error: "Error checking out!" });
        }
        if (entry) {
          if (entry.isCheckedIn === true) {
            entry.timeOut = timeOut;
            entry.isCheckedIn = false;
            entry.save();
            io.emit("entry", { entry: "updated" });
            return res.status(200).json({ error: null });
          }
        } else {
          return res.status(200).json({ error: "No user checked in." });
        }
      });
    }
  })(req, res, next);
});

server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
