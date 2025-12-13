import express, { Request, Response } from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import morgan from "morgan"; // Traffic Logger
import helmet from "helmet"; // Security Headers

// CONFIGURATION
dotenv.config();
const app = express();

app.use(helmet()); // Security: Hides server details (Stealth Mode)
app.use(morgan("dev")); // Logging: Prints "GET /api/status 200 5ms" to terminal
// -----------------------------------

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

// DATABASE CONNECTION
const MONGO_URI = process.env.MONGO_URI || "";

mongoose
  .connect(MONGO_URI)
  .then(() => console.log("🔥 DB CONNECTED"))
  .catch((err) => console.error("❌ DB ERROR:", err));

// 3. MONGOOSE MODEL
const OrderSchema = new mongoose.Schema({
  email: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

const Order = mongoose.model("Order", OrderSchema);

// ZOD SCHEMA (Validation)
const BuySchema = z.object({
  email: z
    .string()
    .regex(/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/, "Invalid email format")
    .min(5, "Email too short")
    .max(100, "Email too long"),
});

// SECURITY: RATE LIMITERS (DDoS Protection)

// General Limiter (Standard traffic)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api/", apiLimiter);

// Strict Limiter (For the BUY button)
const buyLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  message: { success: false, message: "🛑 Too fast! Slow down." },
});

// ROUTES

// GET: Status
app.get("/api/status", async (req: Request, res: Response) => {
  try {
    const count = await Order.countDocuments();
    const LIMIT = 5;
    res.json({
      remaining: Math.max(0, LIMIT - count),
      soldOut: count >= LIMIT,
    });
  } catch (error) {
    res.status(500).json({ error: "Server Error" });
  }
});

// GET: Read Orders
app.get("/api/orders", async (req: Request, res: Response) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: "Could not fetch orders" });
  }
});

// POST: Buy (Protected by 'buyLimiter')
app.post(
  "/api/buy",
  buyLimiter,
  async (req: Request, res: Response): Promise<any> => {
    // A. VALIDATION
    const result = BuySchema.safeParse(req.body);

    if (!result.success) {
      // Fix for TypeScript errors
      const rawError = result.error as any;

      const errorMessage = rawError.errors
        ? rawError.errors[0].message
        : "Invalid Data";

      return res.status(400).json({
        success: false,
        message: errorMessage,
      });
    }

    // LOGIC
    try {
      const count = await Order.countDocuments();
      if (count >= 5) {
        return res
          .status(400)
          .json({ success: false, message: "SOLD OUT! Too late." });
      }

      const newOrder = new Order({ email: result.data.email });
      await newOrder.save();

      return res.json({ success: true, message: "Secure spot reserved!" });
    } catch (error) {
      console.error("Server Error:", error);
      return res.status(500).json({ success: false, message: "Server Error" });
    }
  }
);

// POST: Reset
app.post("/api/reset", async (req: Request, res: Response) => {
  await Order.deleteMany({});
  res.json({ message: "Database Cleared" });
});

//START SERVER
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
