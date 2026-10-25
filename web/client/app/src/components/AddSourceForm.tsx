import { Alert, Button, Stack, TextField } from '@mui/material'
import { useRef, useState } from 'react'
import { getSourceUrlError } from './sourceUrl'

export type AddSourceValues = {
  sourceUrl: string
}

type AddSourceFormProps = {
  onSubmit: (values: AddSourceValues) => void | Promise<void>
  onCancel?: () => void
  submitLabel?: string
}

export default function AddSourceForm({
  onSubmit,
  onCancel,
  submitLabel = 'Add source',
}: AddSourceFormProps) {
  const [sourceUrl, setSourceUrl] = useState('')
  const [touched, setTouched] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submissionError, setSubmissionError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const submittingRef = useRef(false)
  const validationError = getSourceUrlError(sourceUrl)
  const showError = touched && Boolean(validationError)

  return (
    <Stack
      component="form"
      spacing={3}
      noValidate
      aria-busy={isSubmitting}
      onSubmit={async (event) => {
        event.preventDefault()
        if (submittingRef.current) return
        setTouched(true)
        setSubmissionError('')

        if (validationError) {
          inputRef.current?.focus()
          return
        }

        submittingRef.current = true
        setIsSubmitting(true)
        try {
          await onSubmit({ sourceUrl: sourceUrl.trim() })
        } catch {
          setSubmissionError('Submission failed. Your URL is still here. Please try again.')
        } finally {
          submittingRef.current = false
          setIsSubmitting(false)
        }
      }}
    >
      <TextField
        id="source-url"
        name="sourceUrl"
        label="Source URL"
        type="url"
        required
        fullWidth
        inputRef={inputRef}
        disabled={isSubmitting}
        value={sourceUrl}
        onChange={(event) => {
          setSourceUrl(event.target.value)
          setSubmissionError('')
        }}
        onBlur={() => setTouched(true)}
        error={showError}
        helperText={showError ? validationError : 'Enter the address of an audit source.'}
      />
      {submissionError && <Alert severity="error">{submissionError}</Alert>}
      <Stack direction="row" spacing={2}>
        <Button type="submit" variant="contained" disabled={isSubmitting}>
          {isSubmitting ? 'Submitting…' : submitLabel}
        </Button>
        <Button
          type="button"
          disabled={isSubmitting}
          onClick={() => {
            setSourceUrl('')
            setTouched(false)
            setSubmissionError('')
            onCancel?.()
            inputRef.current?.focus()
          }}
        >
          Cancel
        </Button>
      </Stack>
    </Stack>
  )
}
