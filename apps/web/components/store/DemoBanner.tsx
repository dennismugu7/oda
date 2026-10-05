// The demo shop's warning (decision #61 g): nothing is for sale and no money should be sent.
export function DemoBanner() {
  return (
    <p
      role="note"
      className="bg-navy px-4 py-2 text-center text-small font-semibold text-text-on-navy"
    >
      Demo shop: don’t send money. Orders here are only for testing oda.
    </p>
  );
}
