// Ilya Zeldner
// Exclusive Drop Backend Server
// server/src/index.ts
import express, { Request, Response } from "express";
import mongoose, { Schema, Document } from "mongoose";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config(); // Load .env variables

const app = express(); // Create Express App
app.use(cors()); // Allow Frontend to talk to Backend
app.use(express.json()); // Parse JSON data

// CONNECT TO MONGODB ATLAS
const MONGO_URI = process.env.MONGO_URI || "";

mongoose
  .connect(MONGO_URI) // Connect to MongoDB Atlas
  .then(() => console.log("🔥 DB CONNECTED (Atlas)"))
  .catch((err) => console.error("❌ DB ERROR:", err));

// DATA MODEL (Schema)
interface IOrder extends Document {
  // Order Interface
  email: string; // Buyer's Email
  createdAt: Date; // Timestamp
}

const OrderSchema = new Schema({
  // Order Schema
  email: { type: String, required: true }, // Buyer's Email
  createdAt: { type: Date, default: Date.now },
});

const Order = mongoose.model<IOrder>("Order", OrderSchema); // Order Model

// ROUTES

// GET: Check Inventory
app.get("/api/status", async (req: Request, res: Response) => {
  const LIMIT = 5; // Total Stock Limit
  const count = await Order.countDocuments(); // Count Sold Items

  res.json({
    // Return Inventory Status
    remaining: Math.max(0, LIMIT - count), // Remaining Stock
    soldOut: count >= LIMIT, // Sold Out Status
  });
});

// Get the "Waiting List" (READING DATA)
app.get("/api/orders", async (req, res) => {
  // "Find all orders, Sort them by newest first"
  const allOrders = await Order.find().sort({ createdAt: -1 });

  // Send the list back to the frontend
  res.json(allOrders);
});

// POST: Buy Item
app.post("/api/buy", async (req: Request, res: Response) => {
  // Buy Item Endpoint
  const LIMIT = 5; // Total Stock Limit
  const { email } = req.body; // Buyer's Email

  // Validate Email
  if (!email || typeof email !== "string" || !email.includes("@")) {
    return res.status(400).json({ success: false, message: "Invalid email." });
  }

  // Check inventory BEFORE saving
  const count = await Order.countDocuments();

  if (count >= LIMIT) {
    return res.status(400).json({ success: false, message: "SOLD OUT 😢" });
  }

  // Create Order
  await Order.create({ email });
  res.status(201).json({ success: true, message: "CONFIRMED! 🚀" });
});

// POST: Reset (Dev Tool)
app.post("/api/reset", async (req: Request, res: Response) => {
  // Reset Inventory Endpoint
  await Order.deleteMany({});
  res.json({ message: "Stock reset to 5." }); // Confirm Reset
});
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`)); // Start Server
