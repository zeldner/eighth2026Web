/**
 * Project: Exclusive Drop API
 * Developer: Ilya Zeldner
 */

import express, { Request, Response, NextFunction } from "express";
import mongoose, { Document, Schema } from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { z } from "zod";

dotenv.config();
const app = express();

const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
// ZOD VALIDATION
const BuySchema = z.object({
  email: z
    .string()
    .trim()
    .regex(emailRegex, { message: "Please enter a valid email address" }),
});

// TYPES
interface IOrder extends Document {
  email: string;
  createdAt: Date;
}

// MIDDLEWARE
app.use(helmet());
app.use(morgan("dev"));
app.use(cors());
app.use(express.json());

app.use((req: Request, res: Response, next: NextFunction) => {
  res.set("Cache-Control", "no-store");
  next();
});

// RATE LIMITER (POST ONLY)
const buyActionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: {
    success: false,
    message: "Too many attempts. Please wait 1 minute.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// DATABASE
const MONGO_URI = process.env.MONGO_URI || "";

if (!MONGO_URI) {
  console.error("❌ CRITICAL: MONGO_URI is missing from .env!");
} else {
  mongoose
    .connect(MONGO_URI)
    .then(() => console.log("✅ DB STATUS: Connected Successfully"))
    .catch((err: Error) =>
      console.error("❌ DB CONNECTION ERROR:", err.message)
    );
}

const Order = mongoose.model<IOrder>(
  "Order",
  new Schema({
    email: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  })
);

// API ROUTES
app.get("/api/status", async (req: Request, res: Response) => {
  try {
    const count = await Order.countDocuments();
    res.json({ remaining: Math.max(0, 5 - count), soldOut: count >= 5 });
  } catch (err) {
    res.status(500).json({ error: "Sync failed" });
  }
});

// Get all orders (for admin view)
app.get("/api/orders", async (req: Request, res: Response) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json([]);
  }
});

// Buy / Join action
app.post("/api/buy", buyActionLimiter, async (req: Request, res: Response) => {
  try {
    // ZOD SAFE PARSE
    const result = BuySchema.safeParse(req.body);

    if (!result.success) {
      // We extract ONLY the message string
      return res.status(400).json({
        success: false,
        message: result.error.message,
      });
    }

    const { email } = result.data; // Validated email

    // CAPACITY CHECK
    const count = await Order.countDocuments();
    if (count >= 5)
      return res.status(400).json({ message: "Campaign Sold Out!" });

    // SAVE
    await new Order({ email }).save();
    res.json({ success: true, message: "Spot Secured!" });
  } catch (err) {
    res.status(500).json({ message: "Database Error" });
  }
});

// Reset system (delete all orders)
app.post("/api/reset", async (req: Request, res: Response) => {
  try {
    await Order.deleteMany({});
    res.json({ message: "System Reset Successful" });
  } catch (err) {
    res.status(500).json({ message: "Reset Failed" });
  }
});

// Listen on 127.0.0.1 to perfectly match Vite's proxy target
const PORT = 5000;
app.listen(PORT, "127.0.0.1", () => {
  console.log(`🚀 BACKEND ACTIVE: http://127.0.0.1:${PORT}`);
});
