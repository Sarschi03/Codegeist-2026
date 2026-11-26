export const checkoutImageId = "trace-checkout-capture";
export function makeCheckoutCapture() {
  const canvas = document.createElement("canvas");
  canvas.width = 992;
  canvas.height = 662;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Unable to render the checkout example.");
  ctx.scale(2, 2);
  const box = (
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
    fill: string,
    stroke?: string,
  ) => {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  };
  const text = (
    copy: string,
    x: number,
    y: number,
    size: number,
    color: string,
    weight = 500,
  ) => {
    ctx.font = weight + " " + size + "px Arial, sans-serif";
    ctx.fillStyle = color;
    ctx.fillText(copy, x, y);
  };
  box(0.5, 0.5, 495, 330, 12, "#ffffff", "#ddd4ec");
  box(1, 1, 494, 39, 10, "#f9f7fd");
  box(1, 33, 494, 10, 0, "#f9f7fd");
  const dots = ["#bdabd9", "#d3c6e5", "#e1d9ed"];
  dots.forEach((color, i) => box(16 + i * 12, 18, 6, 6, 3, color));
  box(148, 10, 200, 23, 6, "#efebf6");
  text("fieldwork.example / checkout", 177, 25, 11, "#675c77");
  text("fieldwork.", 22, 69, 19, "#2b213e", 740);
  text("SECURE CHECKOUT", 355, 67, 10, "#695b84", 700);
  box(22, 82, 452, 1, 0, "#ede8f4");
  text("Checkout", 22, 116, 26, "#251e36", 740);
  text("Contact information", 23, 148, 13, "#382d4c", 700);
  box(22, 158, 231, 32, 6, "#fbf9fe", "#ded7ea");
  text("Email address", 33, 178, 12, "#695e79");
  text("Delivery address", 23, 213, 13, "#382d4c", 700);
  box(22, 224, 231, 32, 6, "#fbf9fe", "#ded7ea");
  text("Street address", 33, 244, 12, "#695e79");
  box(278, 103, 196, 153, 8, "#f6f1fc", "#e4dbf1");
  text("Order summary", 293, 126, 14, "#382d4c", 700);
  text("Everyday tote", 293, 151, 12, "#655974");
  text("$48.00", 423, 151, 12, "#655974");
  text("Shipping", 293, 173, 12, "#655974");
  text("$6.00", 429, 173, 12, "#655974");
  box(293, 185, 165, 1, 0, "#e3d9f1");
  text("Total", 293, 207, 13, "#382d4c", 700);
  text("$54.00", 421, 207, 13, "#382d4c", 700);
  box(22, 274, 231, 34, 6, "#6746bc");
  text("Continue to payment", 70, 296, 13, "#ffffff", 700);
  return {
    id: checkoutImageId,
    created: Date.now(),
    mimeType: "image/png" as const,
    dataURL: canvas.toDataURL("image/png"),
  };
}
