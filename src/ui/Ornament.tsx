export function Butterfly({ size = 18 }: { size?: number }) {
  return (
    <svg
      class="butterfly"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="currentColor"
    >
      <path d="M12 7c-1.2-2.6-4.4-4.8-7.6-4.4C2 2.9 1.6 5.6 2.6 8c1 2.3 3.4 3.6 6 3.8-2.6.6-4.6 2.4-4.4 4.6.2 2.4 2.8 3.6 5 2.6 1.4-.6 2.3-2 2.8-3.4.5 1.4 1.4 2.8 2.8 3.4 2.2 1 4.8-.2 5-2.6.2-2.2-1.8-4-4.4-4.6 2.6-.2 5-1.5 6-3.8 1-2.4.6-5.1-1.8-5.4C16.4 2.2 13.2 4.4 12 7z" />
      <rect x="11.4" y="6" width="1.2" height="12" rx="0.6" fill="#0b0a10" />
    </svg>
  );
}

export function Divider() {
  return (
    <div class="ornament" aria-hidden="true">
      <Butterfly />
    </div>
  );
}

export function Seal({ text = '対価' }: { text?: string }) {
  return (
    <div class="seal" aria-label="price" title="対価: the price paid for every wish">
      {text}
    </div>
  );
}
