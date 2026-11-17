import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { App } from './App';

test('an unconfigured wedding shows a neutral page without invented personal details', () => {
  render(<App />);
  expect(screen.getByRole('main')).toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Details coming soon');
  expect(screen.queryByRole('form')).not.toBeInTheDocument();
});
