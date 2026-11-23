import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Ctdv from './ctdv';

jest.mock('../utils/aiGen', () => ({
  // eslint-disable-next-line require-yield
  generateWithAIStream: async function* (_rawContent: string, _title: string) {
    throw new Error('AI đang quá tải');
  },
}));

test('AI gen failure keeps the post that was already there', async () => {
  const alertMock = jest.spyOn(window, 'alert').mockImplementation(() => {});
  render(<Ctdv />);

  const textareas = screen.getAllByRole('textbox') as HTMLTextAreaElement[];
  const resultArea = textareas[textareas.length - 1];
  const postBefore = resultArea.value;
  expect(postBefore).not.toBe('');

  fireEvent.click(screen.getByText(/AI gen/i));

  await waitFor(() => expect(alertMock).toHaveBeenCalled());
  expect(alertMock.mock.calls[0][0]).toMatch(/AI đang quá tải/);
  expect(resultArea).toHaveValue(postBefore);

  alertMock.mockRestore();
});
