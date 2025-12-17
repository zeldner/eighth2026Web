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

// 1. Initialize environment variables immediately
dotenv.config();

const app = express();

// INTERFACES
interface IOrder extends Document {
  email: string;
  createdAt: Date;
}

interface BuyRequestBody {
  email: string;
}

// --- 🛡️ MIDDLEWARE ---
app.use(helmet());
app.use(morgan("dev")); // Logs every request to the terminal
app.use(cors());
app.use(express.json());

// Prevent caching for real-time status updates
app.use((req: Request, res: Response, next: NextFunction) => {
  res.set("Cache-Control", "no-store");
  next();
});

// --- 🚦 SELECTIVE RATE LIMITER ---
// Limits  the "Buy" button (POST requests) to prevent bot-spam
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

// DATABASE CONNECTION
const MONGO_URI: string = process.env.MONGO_URI || "";

if (!MONGO_URI) {
  console.error("❌ CRITICAL: MONGO_URI missing from .env!");
} else {
  mongoose
    .connect(MONGO_URI)
    .then(() => console.log("✅ DB STATUS: Connected Successfully"))
    .catch((err: Error) =>
      console.error("❌ DB CONNECTION ERROR:", err.message)
    );
}

const OrderSchema = new Schema<IOrder>({
  email: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

const Order = mongoose.model<IOrder>("Order", OrderSchema);

// --- 🛤️ API ROUTES ---

app.get("/api/status", async (req: Request, res: Response) => {
  try {
    const count = await Order.countDocuments();
    res.json({
      remaining: Math.max(0, 5 - count),
      soldOut: count >= 5,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch status" });
  }
});

app.get("/api/orders", async (req: Request, res: Response) => {
  try {
    const orders: IOrder[] = await Order.find().sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json([]);
  }
});

app.post(
  "/api/buy",
  buyActionLimiter,
  async (req: Request<{}, {}, BuyRequestBody>, res: Response) => {
    try {
      const { email } = req.body;
      const count = await Order.countDocuments();
      if (count >= 5)
        return res.status(400).json({ message: "Campaign Sold Out!" });

      const newOrder = new Order({ email });
      await newOrder.save();
      res.json({ success: true, message: "Spot Secured!" });
    } catch (err) {
      res.status(500).json({ message: "Registration failed." });
    }
  }
);

app.post("/api/reset", async (req: Request, res: Response) => {
  try {
    await Order.deleteMany({});
    res.json({ message: "System Reset Successful" });
  } catch (err) {
    res.status(500).json({ message: "Reset failed" });
  }
});

// Use 127.0.0.1 for maximum compatibility with Vite Proxy
const PORT = 5000;
app.listen(PORT, "127.0.0.1", () => {
  console.log(`🚀 BACKEND ACTIVE: http://127.0.0.1:${PORT}`);
});
