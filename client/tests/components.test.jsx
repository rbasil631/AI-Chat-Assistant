import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ToneToggle } from '../src/components/ToneToggle.jsx';
import { Highlight } from '../src/components/Highlight.jsx';

afterEach(cleanup);

const tones = [
  { id: 'professional', label: 'Professional', description: 'p' },
  { id: 'casual', label: 'Casual', description: 'c' },
  { id: 'concise', label: 'Concise', description: 'x' },
];

describe('ToneToggle', () => {
  it('renders server-provided tones as a radiogroup and reports clicks', () => {
    const onChange = vi.fn();
    render(<ToneToggle tones={tones} value="casual" onChange={onChange} />);
    expect(screen.getByRole('radiogroup', { name: 'Response tone' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Casual' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('radio', { name: 'Concise' }));
    expect(onChange).toHaveBeenCalledWith('concise');
  });

  it('supports arrow-key navigation with wrap-around', () => {
    const onChange = vi.fn();
    render(<ToneToggle tones={tones} value="concise" onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith('professional');
  });
});

describe('Highlight', () => {
  it('wraps server-provided ranges in <mark>', () => {
    const { container } = render(<p><Highlight text="foo bar foo" ranges={[{ start: 0, end: 3 }, { start: 8, end: 11 }]} /></p>);
    expect([...container.querySelectorAll('mark')].map((m) => m.textContent)).toEqual(['foo', 'foo']);
    expect(container.textContent).toBe('foo bar foo');
  });
});
