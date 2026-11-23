import { act, render, screen, fireEvent } from '@testing-library/react';
import Ctdv from './ctdv';

// The stream pauses after its first chunk until the test releases it.
const mockGate: { release: () => void } = { release: () => {} };

jest.mock('../utils/aiGen', () => ({
  generateWithAIStream: async function* (_rawContent: string, _title: string) {
    yield 'A';
    await new Promise<void>((resolve) => {
      mockGate.release = resolve;
    });
    yield 'B';
  },
}));

const LOCKED_BUTTONS = [
  'Replicate',
  'Copy',
  'Append',
  'Assign',
  'Tìm chó lạc',
  'Tìm mèo lạc',
  'Chó lạc tìm chủ',
  'Mèo lạc tìm chủ',
];

const button = (name: string) => screen.getByRole('button', { name });

test('controls are locked while AI gen is streaming', async () => {
  render(<Ctdv />);
  const textareas = screen.getAllByRole('textbox') as HTMLTextAreaElement[];
  const contentArea = textareas[0];
  const postArea = textareas[textareas.length - 1];

  // The async act lets the first chunk arrive before the assertions run.
  await act(async () => {
    fireEvent.click(button('AI gen'));
  });

  expect(
    await screen.findByRole('button', { name: 'Generating...' }),
  ).toBeDisabled();
  LOCKED_BUTTONS.forEach((name) => expect(button(name)).toBeDisabled());
  expect(contentArea).toHaveAttribute('readonly');
  expect(postArea).toHaveAttribute('readonly');
  expect(button('Reload')).toBeEnabled();

  await act(async () => {
    mockGate.release();
  });

  expect(await screen.findByRole('button', { name: 'AI gen' })).toBeEnabled();
  LOCKED_BUTTONS.forEach((name) => expect(button(name)).toBeEnabled());
  expect(contentArea).not.toHaveAttribute('readonly');
  expect(postArea).not.toHaveAttribute('readonly');
  expect(postArea).toHaveValue('AB');
});
