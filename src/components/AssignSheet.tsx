import * as React from 'react';
import Button from '@mui/material/Button';
import Drawer from '@mui/material/Drawer';
import { AssignInfo, ContentKeyInfo, assignKeys } from './assignInfo';
import { tokens } from '../theme';

type AssignSheetProps = {
  open: boolean;
  lines: string[];
  value: AssignInfo;
  onAssign: (next: AssignInfo) => void;
  onCancel: () => void;
};

const TITLE_ID = 'assign-sheet-title';

export default function AssignSheet({
  open,
  lines,
  value,
  onAssign,
  onCancel,
}: AssignSheetProps) {
  // Selections stay in a draft until Assign is pressed; Cancel discards them.
  const [draft, setDraft] = React.useState<AssignInfo>(value);
  const wasOpen = React.useRef(false);

  React.useEffect(() => {
    if (open && !wasOpen.current) setDraft(value);
    wasOpen.current = open;
  }, [open, value]);

  const isEmpty =
    lines.length === 0 && assignKeys.every((key) => value[key] === '');

  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={onCancel}
      ModalProps={{
        BackdropProps: { sx: { backgroundColor: tokens.overlay } },
      }}
      PaperProps={{
        role: 'dialog',
        'aria-modal': true,
        'aria-labelledby': TITLE_ID,
        sx: {
          maxWidth: 480,
          maxHeight: '85vh',
          margin: '0 auto',
          padding: '8px 16px 0',
          borderRadius: '22px 22px 0 0',
          backgroundColor: tokens.surfaceRaised,
          backgroundImage: 'none',
          color: tokens.text,
        },
      }}
    >
      <div className="ctdv-sheet-grab" aria-hidden="true" />
      <h2 id={TITLE_ID} className="ctdv-sheet-title">
        Assign
      </h2>

      {isEmpty ? (
        <p className="ctdv-sheet-empty">
          Chưa có nội dung. Dán nội dung trước rồi mới Assign.
        </p>
      ) : (
        <div className="ctdv-sheet-rows">
          {assignKeys.map((key) => {
            const fieldId = `assign-field-${key}`;
            const current = draft[key];
            const isStale = current !== '' && !lines.includes(current);
            return (
              <div className="ctdv-sheet-row" key={key}>
                <label htmlFor={fieldId}>
                  {ContentKeyInfo.get(key)?.translate}
                </label>
                <select
                  id={fieldId}
                  value={current}
                  onChange={(event) =>
                    setDraft({ ...draft, [key]: event.target.value })
                  }
                >
                  <option value="">—</option>
                  {lines.map((line) => (
                    <option key={line} value={line}>
                      {line}
                    </option>
                  ))}
                  {isStale && <option value={current}>{current}</option>}
                </select>
              </div>
            );
          })}
        </div>
      )}

      <div className="ctdv-sheet-footer">
        <Button variant="outlined" color="inherit" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color="primary"
          onClick={() => onAssign(draft)}
          disabled={isEmpty}
        >
          Assign
        </Button>
      </div>
    </Drawer>
  );
}
