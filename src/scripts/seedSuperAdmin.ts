import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

import {
  UserModel,
  UserRole,
  UserStatus
} from "../models/user.model";

dotenv.config();

const seedSuperAdmin = async () => {
  try {
    const mongoUrl = process.env.MONGO_URL;
    const username = process.env.SUPER_ADMIN_USERNAME;
    const email = process.env.SUPER_ADMIN_EMAIL;
    const password = process.env.SUPER_ADMIN_PASSWORD;

    if (!mongoUrl || !username || !email || !password) {
      throw new Error("Required environment variables are missing!");
    }

    await mongoose.connect(mongoUrl);

    console.log("MongoDB Connected!");

    // Check whether a Super Admin already exists
    const existingSuperAdmin = await UserModel.findOne({
      user_role: UserRole.SUPER_ADMIN
    });

    if (existingSuperAdmin) {
      console.log("Super Admin already exists!");
      return;
    }

    // Check duplicate username or email
    const existingUser = await UserModel.findOne({
      $or: [
        { username },
        { email }
      ]
    });

    if (existingUser) {
      throw new Error("Username or Email already exists!");
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create Super Admin
    await UserModel.create({
      first_name: "System",
      last_name: "Administrator",
      username,
      email,
      password: hashedPassword,
      user_role: UserRole.SUPER_ADMIN,
      user_status: UserStatus.ACTIVE
    });

    console.log("Super Admin created successfully!");

  } catch (error) {
    console.error("Super Admin Seed Error:", error);
    process.exitCode = 1;

  } finally {
    await mongoose.disconnect();
  }
};

seedSuperAdmin();
