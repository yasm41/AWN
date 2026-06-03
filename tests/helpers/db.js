const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

let mongod;

/**
 * Start an in-memory MongoDB instance and connect Mongoose to it.
 * Call this in beforeAll().
 */
const connect = async () => {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri);
};

/**
 * Drop all collections between tests to guarantee isolation.
 * Call this in afterEach().
 */
const clearDatabase = async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
};

/**
 * Disconnect Mongoose and stop the in-memory server.
 * Call this in afterAll().
 */
const disconnect = async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  await mongod.stop();
};

module.exports = { connect, clearDatabase, disconnect };
