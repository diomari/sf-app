import type { Account } from '@salesforce-account-app/shared'

import { SafeWebsiteLink } from './SafeWebsiteLink.js'

interface AccountsTableProps {
  accounts: Account[]
  onEdit: (account: Account) => void
  onDelete: (account: Account) => void
}

export const AccountsTable = ({
  accounts,
  onEdit,
  onDelete,
}: AccountsTableProps) => {
  return (
    <div
      className="table-scroll"
      role="region"
      aria-label="Accounts table"
      tabIndex={0}
    >
      <table>
        <caption className="visually-hidden">Salesforce Accounts</caption>
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Account Number</th>
            <th scope="col">Type</th>
            <th scope="col">Industry</th>
            <th scope="col">Phone</th>
            <th scope="col">Website</th>
            <th scope="col">
              <span className="visually-hidden">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {accounts.map((account) => (
            <tr key={account.id}>
              <th scope="row">{account.name}</th>
              <td>{account.accountNumber ?? '—'}</td>
              <td>{account.type ?? '—'}</td>
              <td>{account.industry ?? '—'}</td>
              <td>{account.phone ?? '—'}</td>
              <td>
                <SafeWebsiteLink website={account.website} />
              </td>
              <td className="row-actions">
                <button
                  type="button"
                  aria-label={`Edit ${account.name}`}
                  onClick={() => onEdit(account)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="danger"
                  aria-label={`Delete ${account.name}`}
                  onClick={() => onDelete(account)}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
