import Alert from '@mui/material/Alert'
import Container from '@mui/material/Container'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { createSource, type SavedSource } from '../api/sources'
import AddSourceForm from '../components/AddSourceForm'

type AddSourcePageProps = {
  user: string | null
}

export default function AddSourcePage({ user }: AddSourcePageProps) {
  // Reset form values and feedback if the shared shell changes user identity.
  return <AddSourceContent key={user} user={user} />
}

function AddSourceContent({ user }: AddSourcePageProps) {
  const [savedSource, setSavedSource] = useState<SavedSource | null>(null)
  const canSubmit = Boolean(user?.trim())

  return (
    <Container component="main" maxWidth="sm" sx={{ py: 4 }}>
      <Stack spacing={3}>
        <Typography variant="h4" component="h1">Add Source</Typography>
        <Typography color="text.secondary">
          Add the web address of an audit source.
        </Typography>
        {!canSubmit && (
          <Alert severity="info">
            Sign in through the shared application before adding a source.
          </Alert>
        )}
        <AddSourceForm
          disabled={!canSubmit}
          onChange={() => setSavedSource(null)}
          onSubmit={async ({ sourceUrl }) => {
            setSavedSource(null)
            const result = await createSource({ user: user ?? '', sourceUrl })
            setSavedSource(result)
          }}
          onCancel={() => setSavedSource(null)}
        />
        <div role="status" aria-live="polite" aria-atomic="true">
          {savedSource && (
            <Alert severity="success" sx={{ overflowWrap: 'anywhere' }}>
              Source saved: {savedSource.source_link}
            </Alert>
          )}
        </div>
      </Stack>
    </Container>
  )
}
