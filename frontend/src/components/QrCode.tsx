import { QRCodeSVG } from "qrcode.react";

type QrCodeProps = {
  value: string;
  size?: number;
};

export function QrCode({ value, size = 280 }: QrCodeProps) {
  return (
    <div className="qr-code">
      <QRCodeSVG
        value={value}
        size={size}
        bgColor="#f7f1df"
        fgColor="#11100f"
        level="M"
        marginSize={2}
      />
      <p>{value}</p>
    </div>
  );
}
