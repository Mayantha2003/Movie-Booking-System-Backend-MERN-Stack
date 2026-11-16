
import transporter from "../config/email";

interface BookingEmailData {
  email: string;
  customerName: string;
  bookingCode: string;
  pdfBuffer: Buffer;
}

const escapeHtml = (value: string): string => {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };

    return entities[character];
  });
};

export const sendBookingConfirmationEmail = async (
  data: BookingEmailData
): Promise<void> => {
  const { email, customerName, bookingCode, pdfBuffer } = data;

  if (
    !email ||
    !customerName ||
    !bookingCode ||
    !pdfBuffer?.length
  ) {
    throw new Error("Missing booking email information.");
  }

  const safeName = escapeHtml(customerName);
  const safeBookingCode = escapeHtml(bookingCode);

  await transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to: email,
    subject: `Booking Confirmed - ${bookingCode}`,

    text: `
Hi ${customerName},

Your movie booking has been successfully confirmed.

Booking Reference: ${bookingCode}

Your PDF e-ticket is attached to this email.

Please present your ticket at the cinema entrance.

Thank you for booking with Movie Booking System!
    `,

    html: `
      <div style="
        font-family: Arial, sans-serif;
        max-width: 600px;
        margin: auto;
        padding: 25px;
        color: #222;
      ">
        <h2 style="color: #E50914;">
          MOVIE BOOKING
        </h2>

        <h3>Booking Confirmed!</h3>

        <p>Hi ${safeName},</p>

        <p>
          Your payment was successful and your movie
          booking has been confirmed.
        </p>

        <div style="
          background: #f5f5f5;
          padding: 15px;
          border-radius: 8px;
        ">
          <p><strong>Booking Reference:</strong></p>

          <h2 style="color: #E50914;">
            ${safeBookingCode}
          </h2>
        </div>

        <p>
          Your PDF e-ticket is attached to this email.
        </p>

        <p>
          Please present the ticket at the cinema entrance.
        </p>

        <p>
          Thank you for booking with Movie Booking System!
        </p>
      </div>
    `,

    attachments: [
      {
        filename: `Movie-Ticket-${bookingCode}.pdf`,
        content: pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  });

  console.log(
    `Booking confirmation email sent for ${bookingCode}`
  );
};
