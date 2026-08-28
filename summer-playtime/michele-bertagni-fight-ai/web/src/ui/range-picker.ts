/**
 * How far back to look: today, or up to four days back, counted from the day the
 * viewer is using the app.
 *
 * Each option is a cumulative window ending now - "YESTERDAY" means since
 * midnight yesterday, so it includes today as well. Rather than explain that in
 * a footnote, every button shows the actual dates it covers.
 */
export const DAY_LABELS = ['TODAY', 'YESTERDAY', '2 DAYS AGO', '3 DAYS AGO', '4 DAYS AGO'] as const;

const dayMonth = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });

/** "28 Aug" for today, "26 - 28 Aug" for anything older. */
export function windowCaption(offset: number, now = new Date()): string {
  const today = dayMonth.format(now);
  if (offset === 0) return `${today}, since 00:00`;
  const from = new Date(now);
  from.setDate(from.getDate() - offset);
  return `${dayMonth.format(from)} - ${today}`;
}

export function mountRangePicker(
  container: HTMLElement,
  maxDaysBack: number,
  onChange: (daysBack: number) => void,
): void {
  container.replaceChildren();

  for (let offset = 0; offset <= maxDaysBack; offset++) {
    const label = DAY_LABELS[offset] ?? `${offset} DAYS AGO`;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'range-option';
    button.dataset.days = String(offset);

    const name = document.createElement('span');
    name.className = 'range-name';
    name.textContent = label;

    const caption = document.createElement('span');
    caption.className = 'range-caption';
    caption.textContent = windowCaption(offset);

    button.append(name, caption);
    button.addEventListener('click', () => {
      for (const other of container.querySelectorAll('.range-option')) {
        other.classList.remove('selected');
      }
      button.classList.add('selected');
      onChange(offset);
    });
    container.appendChild(button);
  }
}
