import { Alert, Container, Stack, Typography } from '@mui/material'
import { useState } from 'react'
import AddSourceForm from './components/AddSourceForm'

function App() {
  const [validatedUrl, setValidatedUrl] = useState('')

  return (
    <Container component="main" maxWidth="sm" sx={{ py: 4 }}>
      <Stack spacing={3}>
        <Typography variant="h4" component="h1">
          Add Source
        </Typography>
        <Typography color="text.secondary">
          Form preview: submitting checks the URL format. No source will be saved.
        </Typography>
        <AddSourceForm
          submitLabel="Validate source"
          onSubmit={({ sourceUrl }) => setValidatedUrl(sourceUrl)}
          onCancel={() => setValidatedUrl('')}
        />
        <div role="status" aria-live="polite" aria-atomic="true">
          {validatedUrl && (
            <Alert severity="info" sx={{ overflowWrap: 'anywhere' }}>
              URL format accepted: {validatedUrl}. No source has been saved.
            </Alert>
          )}
        </div>
      </Stack>
    </Container>
  )
}

export default App
