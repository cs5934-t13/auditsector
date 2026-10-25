import { useState } from 'react'
import { readStoredUsername } from './auth/storedUser'
import AddSourcePage from './pages/AddSourcePage'

function App() {
  const [username] = useState(() => readStoredUsername())
  return <AddSourcePage user={username} />
}

export default App
