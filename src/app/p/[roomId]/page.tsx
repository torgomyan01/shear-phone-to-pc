import { PhoneView } from "@/components/phone/PhoneView";

interface PhonePageProps {
  params: Promise<{ roomId: string }>;
}

export default async function PhonePage({ params }: PhonePageProps) {
  const { roomId } = await params;
  return <PhoneView roomId={roomId.toUpperCase()} />;
}
