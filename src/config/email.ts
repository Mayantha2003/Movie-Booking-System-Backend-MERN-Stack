import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export const verifyEmailConnection = async (): Promise<boolean> => {
  try {
    await transporter.verify();
    console.log("Email server connection successful!");
    return true;
  } catch (error) {
    console.error("Email server connection failed:", error);
    return false;
  }
};

export default transporter;
