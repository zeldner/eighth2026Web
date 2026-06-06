/**
 * Project: Exclusive Drop API
 * Developer: Ilya Zeldner
 * Stack: Hono + Mongoose + Zod + Pino (Node.js Environment)
 */

import { serve } from "@hono/node-server";
import { getConnInfo } from "@hono/node-server/conninfo";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { zValidator } from "@hono/zod-validator";
import mongoose, { Schema, Document } from "mongoose";
import dotenv from "dotenv";
import { z } from "zod";
import pino from "pino";

// Load environment variables
dotenv.config();

// LOGGER INITIALIZATION (PINO)
const systemLog = pino({
  transport: {
    targets: [
      { target: "pino-pretty", options: { colorize: true } }, // Terminal output
      { target: "pino/file", options: { destination: "./server.log" } }, // File output
    ],
  },
});

const app = new Hono(); // Hono : A lightweight and high-performance web framework for Node.js, designed for building APIs and web applications with a focus on speed and simplicity.

// GLOBAL MIDDLEWARE

app.use("*", cors({ origin: "*" }));

// Custom request logger using Pino (Includes Client IP and User-Agent)
app.use("*", async (c, next) => {
  const start = Date.now();

  // Extract client information
  const userAgent = c.req.header("user-agent") || "Unknown Device"; // Capture User-Agent for device insights and analytics purposes
  // Attempt to get the client's real IP address, accounting for proxies and load balancers
  // This is crucial for accurate logging, security monitoring, and analytics, especially when the server is behind a reverse proxy or load balancer that may mask the original client IP.
  let clientIp = "Unknown IP";

  try {
    // Attempt to get the real IP address from the Node connection
    const info = getConnInfo(c); // getConnInfo is a utility function provided by Hono to extract connection information, including the remote IP address. This is particularly useful when the server is running in an environment where the client's IP might be masked by a proxy or load balancer.
    if (info.remote.address) {
      clientIp = info.remote.address; // Use the remote address from the connection info if available
    }
  } catch (err) {
    // Fallback if running behind a proxy
    clientIp = c.req.header("x-forwarded-for") || "Unknown IP"; // The "X-Forwarded-For" header is commonly used to identify the originating IP address of a client connecting to a web server through an HTTP proxy or load balancer. This is essential for accurate logging and security monitoring, especially in production environments where the server may be behind a reverse proxy or load balancer that can mask the original client IP.
  }

  await next(); // Proceed to the next middleware or route handler
  // Calculate the duration of the request processing for performance monitoring and logging purposes. This helps in identifying slow requests and optimizing the server's performance.

  const ms = Date.now() - start; // Calculate the duration of the request processing for performance monitoring and logging purposes. This helps in identifying slow requests and optimizing the server's performance.

  // Log server execution details AND client details
  systemLog.info(
    {
      method: c.req.method,
      url: c.req.url,
      status: c.res.status,
      duration: `${ms}ms`,
      clientIp: clientIp,
      userAgent: userAgent,
    },
    "HTTP Request Received",
  );
});

app.use("*", async (c, next) => {
  // Prevent browser caching for API responses
  c.header("Cache-Control", "no-store");
  await next();
}); // This middleware sets the "Cache-Control" header to "no-store" for all API responses, ensuring that browsers do not cache any responses from the server. This is crucial for an exclusive drop campaign where real-time data accuracy is essential, and we want to prevent users from seeing outdated information about campaign status or availability. By disabling caching, we ensure that every request to the server retrieves the most current data, providing a better user experience and maintaining the integrity of the campaign's real-time updates.

// DATABASE CONNECTION
const MONGO_URI = process.env.MONGO_URI || "";

if (!MONGO_URI) {
  systemLog.fatal("CRITICAL: MONGO_URI is missing from environment variables!");
} else {
  mongoose
    .connect(MONGO_URI)
    .then(() => systemLog.info("DB STATUS: Connected to MongoDB Atlas"))
    .catch((err: Error) =>
      systemLog.error({ err: err.message }, "DB CONNECTION ERROR"),
    ); // This code attempts to connect to MongoDB Atlas using the connection string provided in the environment variable MONGO_URI. If the connection is successful, it logs a success message. If there is an error during the connection attempt, it catches the error and logs it with a descriptive message. This ensures that any issues with database connectivity are promptly identified and can be addressed by the developer or system administrator.
}

// DATABASE MODELS
interface IOrder extends Document {
  email: string;
  createdAt: Date;
} // This interface defines the structure of an Order document in MongoDB, specifying that each order must have an email (string) and a createdAt timestamp (Date). By extending Document, it also includes MongoDB's default document properties, such as _id. This interface is used to ensure type safety when working with Order documents in the application, allowing for better code quality and reducing the likelihood of runtime errors related to data structure.

const OrderSchema = new Schema<IOrder>({
  email: { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now },
}); // This code defines a Mongoose schema for the Order model, specifying that each order must have an email field (which is a required string and must be unique) and a createdAt field (which is a date that defaults to the current date and time). The unique constraint on the email field ensures that no two orders can have the same email address, which is crucial for maintaining the integrity of the campaign and preventing duplicate registrations. The createdAt field allows us to track when each order was placed, which can be useful for analytics and monitoring campaign activity.

const Order = mongoose.model<IOrder>("Order", OrderSchema); // This line creates a Mongoose model named "Order" based on the OrderSchema. The model provides an interface for interacting with the orders collection in MongoDB, allowing us to perform CRUD operations (Create, Read, Update, Delete) on order documents while ensuring that they adhere to the defined schema structure. By using this model, we can easily manage orders in our application and maintain data consistency.

// VALIDATION SCHEMAS (ZOD)
const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const BuySchema = z.object({
  email: z
    .string()
    .trim()
    .regex(emailRegex, { message: "Please enter a valid email address" }),
}); // This code defines a Zod schema for validating the input of the /api/buy endpoint. The schema expects an object with a single property, email, which must be a string that matches a regular expression pattern for valid email addresses. The regex ensures that the email has a proper format (e.g.,

// API ROUTES

// Get current campaign status
app.get("/api/status", async (c) => {
  try {
    const count = await Order.countDocuments();
    return c.json({
      remaining: Math.max(0, 5 - count),
      soldOut: count >= 5,
    });
  } catch (err) {
    systemLog.error({ err }, "Failed to sync campaign status");
    return c.json({ error: "Failed to sync campaign status" }, 500);
  }
}); // This endpoint provides real-time information about the campaign's status, including how many spots are remaining and whether the campaign is sold out. It counts the number of orders in the database and calculates the remaining spots based on a total capacity of 5. If there is an error while fetching the data, it logs the error and returns a 500 status code with an appropriate error message.

// Admin View: Get all registered orders
app.get("/api/orders", async (c) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    return c.json(orders);
  } catch (err) {
    systemLog.error({ err }, "Failed to fetch orders");
    return c.json([], 500);
  }
}); // This endpoint allows administrators to retrieve a list of all registered orders, sorted by the most recent first. It queries the database for all orders and returns them in JSON format. If there is an error during the database query, it logs the error and returns an empty array with a 500 status code, indicating that the request failed to fetch the orders. This endpoint is essential for monitoring campaign activity and managing registrations effectively.

// Main Action: Claim a spot
app.post(
  "/api/buy",
  // Intercept Zod validation errors to send a clean message to the React frontend
  zValidator("json", BuySchema, (result, c) => {
    if (!result.success) {
      systemLog.warn(
        { issues: result.error.errors },
        "Validation failed for /api/buy",
      );
      return c.json(
        {
          success: false,
          message: result.error.errors[0]?.message || "Invalid input provided",
        },
        400,
      );
    }
  }),
  async (c) => {
    try {
      const { email } = c.req.valid("json");

      // ATOMIC TRANSACTION: Prevent race conditions
      const session = await mongoose.startSession();
      let secured = false;

      await session.withTransaction(async () => {
        const count = await Order.countDocuments({}).session(session);

        // Strict capacity check
        if (count < 5) {
          await Order.create([{ email }], { session });
          secured = true;
        }
      });
      session.endSession();

      if (!secured) {
        systemLog.warn(
          { event: "SOLD_OUT_ATTEMPT", email },
          "User tried to buy but campaign is sold out",
        );
        return c.json({ success: false, message: "Campaign Sold Out!" }, 400);
      }

      // Business log for successful registrations
      systemLog.info({ event: "PURCHASE", email }, "🎉 New Spot Claimed!");

      return c.json({ success: true, message: "Spot Secured!" });
    } catch (err: any) {
      // Handle MongoDB unique constraint error natively
      if (err.code === 11000) {
        systemLog.warn(
          { event: "DUPLICATE_EMAIL", email },
          "User tried to register an existing email",
        );
        return c.json(
          { success: false, message: "This email is already registered!" },
          400,
        );
      }
      systemLog.error({ err }, "Internal Database Error during /api/buy");
      return c.json(
        { success: false, message: "Internal Database Error" },
        500,
      );
    }
  },
); // This endpoint allows users to claim a spot in the exclusive drop campaign by submitting their email address. It uses Zod for input validation to ensure that the email is in a valid format. The endpoint also implements an atomic transaction

// Admin Action: Reset the system
app.post("/api/reset", async (c) => {
  try {
    await Order.deleteMany({});
    systemLog.warn({ event: "SYSTEM_RESET" }, "System was reset by admin");
    return c.json({ message: "System Reset Successful" });
  } catch (err) {
    systemLog.error({ err }, "System Reset Failed");
    return c.json({ message: "System Reset Failed" }, 500);
  }
}); // This endpoint allows administrators to reset the campaign by deleting all existing orders from the database. It logs a warning when the system is reset, providing an audit trail for administrative actions. If the reset is successful, it returns a success message; if there is an error during the reset process, it logs the error and returns a failure message with a 500 status code.

// 7. SERVER INITIALIZATION

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

serve(
  {
    fetch: app.fetch,
    port: PORT,
    hostname: "127.0.0.1",
  },
  (info) => {
    systemLog.info(`🚀 BACKEND ACTIVE: http://${info.address}:${info.port}`);
  },
);
