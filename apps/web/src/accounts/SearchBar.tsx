const MIN_SEARCH_LENGTH = 2
const MAX_SEARCH_LENGTH = 100

export { MIN_SEARCH_LENGTH, MAX_SEARCH_LENGTH }

interface SearchBarProps {
  value: string
  onChange: (value: string) => void
}

export const SearchBar = ({ value, onChange }: SearchBarProps) => {
  const trimmedLength = value.trim().length
  const showHint = trimmedLength > 0 && trimmedLength < MIN_SEARCH_LENGTH

  return (
    <div className="search-bar">
      <label htmlFor="account-search">Search accounts</label>
      <input
        id="account-search"
        type="search"
        placeholder="Search by Account Name or Account Number"
        value={value}
        maxLength={MAX_SEARCH_LENGTH}
        onChange={(event) => onChange(event.target.value)}
        aria-describedby="account-search-hint"
      />
      <p id="account-search-hint" className="hint">
        {showHint
          ? `Enter at least ${MIN_SEARCH_LENGTH} characters to search.`
          : 'Matches Account Name and Account Number only.'}
      </p>
    </div>
  )
}
