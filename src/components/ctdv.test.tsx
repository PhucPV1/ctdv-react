import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Ctdv from './ctdv';

jest.mock('../utils/aiGen', () => ({
  generateWithAIStream: async function* (_rawContent: string, _title: string) {
    yield 'A';
    yield 'B';
  },
}));

test('AI gen streams tokens into the Bài Viết textarea', async () => {
  render(<Ctdv />);

  const textareas = screen.getAllByRole('textbox') as HTMLTextAreaElement[];
  const contentArea = textareas[0];
  const resultArea = textareas[textareas.length - 1];

  fireEvent.change(contentArea, { target: { value: 'some pet info' } });

  const aiButton = screen.getByText(/AI gen/i);
  fireEvent.click(aiButton);

  await waitFor(() => expect(resultArea).toHaveValue('AB'));
});
