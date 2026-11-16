
import PDFDocument from "pdfkit";
import QRCode from "qrcode";

export interface TicketData {
  bookingCode: string;
  movieName: string;
  cinemaName: string;
  screenName: string;
  showDate: Date | string;
  startTime: string;
  seats: string[];
  totalSeats: number;
  finalAmount: number;
  paymentStatus: "Pending" | "Paid" | "Failed" | "Cancelled" | "Refunded";
  bookingStatus: "Pending" | "Confirmed" | "Cancelled" | "Completed";
}

export const generateTicketPdf = async (
  ticket: TicketData
): Promise<Buffer> => {
  // Only generate final tickets for paid and confirmed bookings.
  if (
    ticket.paymentStatus !== "Paid" ||
    ticket.bookingStatus !== "Confirmed"
  ) {
    throw new Error(
      "PDF ticket can only be generated for paid and confirmed bookings."
    );
  }

  if (!ticket.seats.length || ticket.seats.length !== ticket.totalSeats) {
    throw new Error("Invalid ticket seat information.");
  }

  // Generate QR code using the booking code.
  const qrCodeBuffer = await QRCode.toBuffer(ticket.bookingCode, {
    type: "png",
    errorCorrectionLevel: "M",
    width: 220,
    margin: 1,
  });

  // Create PDF document.
  const doc = new PDFDocument({
    size: "A4",
    margin: 50,
    info: {
      Title: "Movie Booking E-Ticket",
      Author: "Movie Booking System",
    },
  });

  const chunks: Buffer[] = [];

  return new Promise((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });

    doc.on("end", () => {
      resolve(Buffer.concat(chunks));
    });

    doc.on("error", (error: Error) => {
      reject(error);
    });

    // Header
    doc
      .fontSize(26)
      .fillColor("#E50914")
      .text("MOVIE BOOKING", { align: "center" });

    doc
      .moveDown(0.5)
      .fontSize(16)
      .fillColor("#222222")
      .text("E-TICKET CONFIRMATION", { align: "center" });

    doc.moveDown(1.5);

    // Booking Code
    doc
      .fontSize(12)
      .fillColor("#555555")
      .text("BOOKING REFERENCE", { align: "center" });

    doc
      .moveDown(0.3)
      .fontSize(20)
      .fillColor("#E50914")
      .text(ticket.bookingCode, { align: "center" });

    doc.moveDown(1.5);

    // Movie Details
    doc
      .fontSize(18)
      .fillColor("#111111")
      .text(ticket.movieName);

    doc.moveDown(0.8);

    doc
      .fontSize(12)
      .fillColor("#444444");

    doc.text(`Cinema: ${ticket.cinemaName}`);
    doc.moveDown(0.4);

    doc.text(`Screen: ${ticket.screenName}`);
    doc.moveDown(0.4);

    const formattedDate = new Date(ticket.showDate).toLocaleDateString(
      "en-LK",
      {
        year: "numeric",
        month: "long",
        day: "numeric",
      }
    );

    doc.text(`Date: ${formattedDate}`);
    doc.moveDown(0.4);

    doc.text(`Show Time: ${ticket.startTime}`);
    doc.moveDown(0.4);

    doc.text(`Seats: ${ticket.seats.join(", ")}`);
    doc.moveDown(0.4);

    doc.text(`Total Seats: ${ticket.totalSeats}`);
    doc.moveDown(0.4);

    // Payment Details
    doc.moveDown(1);

    doc
      .fontSize(15)
      .fillColor("#111111")
      .text("PAYMENT DETAILS");

    doc.moveDown(0.5);

    doc
      .fontSize(12)
      .fillColor("#228B22")
      .text("Payment Status: PAID");

    doc.moveDown(0.4);

    doc
      .fontSize(14)
      .fillColor("#111111")
      .text(
        `Total Amount: LKR ${ticket.finalAmount.toLocaleString("en-LK", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`
      );

    // QR Code
    doc.moveDown(1.5);

    doc
      .fontSize(12)
      .fillColor("#333333")
      .text("SCAN QR CODE AT THE CINEMA", {
        align: "center",
      });

    doc.moveDown(0.5);

    doc.image(qrCodeBuffer, {
      fit: [140, 140],
      align: "center",
    });

    // Footer
    doc.moveDown(1);

    doc
      .fontSize(10)
      .fillColor("#777777")
      .text(
        "Thank you for booking with Movie Booking System!",
        { align: "center" }
      );

    doc
      .moveDown(0.5)
      .text("Please present your ticket at the cinema entrance.", {
        align: "center",
      });

    // Finish PDF
    doc.end();
  });
};
