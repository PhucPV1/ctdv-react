import Button from '@mui/material/Button';

type ActionBarProps = {
  isGenerating: boolean;
  onReplicate: () => void;
  onAiGen: () => void;
  onCopy: () => void;
};

export default function ActionBar({
  isGenerating,
  onReplicate,
  onAiGen,
  onCopy,
}: ActionBarProps) {
  return (
    <div className="ctdv-bar">
      <Button
        variant="outlined"
        color="inherit"
        onClick={onReplicate}
        disabled={isGenerating}
      >
        <span className="ctdv-btn-label">Replicate</span>
      </Button>
      <Button
        variant="contained"
        color="secondary"
        onClick={onAiGen}
        disabled={isGenerating}
      >
        <span className="ctdv-btn-label">
          {isGenerating ? 'Generating...' : 'AI gen'}
        </span>
      </Button>
      <Button
        variant="contained"
        color="primary"
        onClick={onCopy}
        disabled={isGenerating}
      >
        <span className="ctdv-btn-label">Copy</span>
      </Button>
    </div>
  );
}
