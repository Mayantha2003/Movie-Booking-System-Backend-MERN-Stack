import { Document,model,Schema, } from "mongoose";  

export enum UserRole{
    ADMIN = "ADMIN",
    USER = "USER",
}

export enum UserStatus {
  ACTIVE = "ACTIVE",
  INACTIVE = "INACTIVE",
  BLOCKED = "BLOCKED",
}

export interface IUser extends Document{
    first_name : string;
    last_name : string;
    username : string;
    email?: string;
    phone?: string;
    password : string;
    user_role: UserRole;
    user_status: UserStatus;
    is_verified: boolean;
    verification_token?: string;
}

const userSchema = new Schema<IUser>(
  {
    first_name: { type: String, required: true },
    last_name: { type: String, required: true },
    username: { type: String, required: true, unique: true },
    email: { type: String, unique: true, sparse: true },
    phone: { type: String },
    password: { type: String, required: true },
    user_role: {
      type: String,
      enum: Object.values(UserRole),
      default: UserRole.USER,
    },
    user_status: {
      type: String,
      enum: Object.values(UserStatus),
      default: UserStatus.ACTIVE,
    },
    is_verified: { type: Boolean, default: false },
    verification_token: { type: String },
  },
  { timestamps: true }
);

export const UserModel = model<IUser>("users", userSchema);