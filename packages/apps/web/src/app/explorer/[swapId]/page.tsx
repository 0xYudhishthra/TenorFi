import { POSITIONS, getPosition } from "@/lib/tenorfi-data";
import PositionDetailClient from "@/components/explorer/PositionDetailClient";

// Pre-render the known mock ids at build time; live ids are resolved client-side
// (with mock fallback) inside PositionDetailClient. Allow unknown ids too.
export function generateStaticParams() {
  return POSITIONS.map((p) => ({ swapId: String(p.id) }));
}

export const dynamicParams = true;

export default function PositionDetailPage({
  params,
}: {
  params: { swapId: string };
}) {
  const position = getPosition(Number(params.swapId)) ?? null;
  return <PositionDetailClient position={position} swapId={params.swapId} />;
}
