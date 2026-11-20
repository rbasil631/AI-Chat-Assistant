const STARTERS = [
  'Explain how HTTPS keeps my data private',
  'Write a SQL query for the top 5 customers by revenue',
  'Help me plan a 3-day study schedule for exams',
  'What are good habits for writing clean code?',
];

export function EmptyState({ toneLabel, onPick }) {
  return (
    <section className="empty">
      <h1>What can I help with?</h1>
      <p>Pick a tone above, then ask anything. Replies will be {toneLabel?.toLowerCase() ?? 'styled to your tone'}, and you can switch tone between messages.</p>
      <ul className="starters">
        {STARTERS.map((s) => (
          <li key={s}><button type="button" onClick={() => onPick(s)}>{s}</button></li>
        ))}
      </ul>
    </section>
  );
}
