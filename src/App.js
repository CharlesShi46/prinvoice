import React, { Component } from 'react'
import UserForm from './components/UserForm/UserForm.js'
import NavBar from './components/NavBar/NavBar.js'
import NewInvoiceForm from './components/NewInvoiceForm/NewInvoiceForm.js'
import { USERBASE_APP_ID } from './config'
import { init, restoreFromBackupFile } from './database/init'
import InvoicesDashboard from './components/InvoicesDashboard/InvoicesDashboard'
import CustomersDashboard from './components/CustomersDashboard/CustomersDashboard'
import Dashboard from './components/Dashboard/Dashboard'
import { hasCreatedInvoice } from './components/Dashboard/logic'
import Account from './components/Account/Account'
import { downloadFileLocally, importFile } from './utils.js'
import { v4 as uuidv4 } from 'uuid'

class App extends Component {
  constructor(props) {
    super(props)

    this.state = {
      mode: undefined,
      user: undefined,
      lastUsedUsername: undefined
    }
  }

  async componentDidMount() {
    window.addEventListener('hashchange', this.handleReadHash, false)

    try {
      const session = {
        user: {
          authToken: "",
          creationDate: "",
          email: "anonymous@gmail.com",
          paymentsMode: "disabled",
          userId: uuidv4(),
          username: "anonymous@gmail.com"
        }
      }

      // check if user is signed in
      if (session.user) await this.loadData()

      this.setState({ ...session })
    } catch (e) {
      localStorage.clear()

      console.error(e)
      window.alert('Oops! Something went wrong. Please refresh the page.\n\nIf the issue persists, please contact support@prinvoice.com.')
    }

    this.handleReadHash()
  }

  loadData = async () => {}

  handleSignIn = async (user) => {
    await this.loadData()
    this.setState({ user })
    window.location.hash = ''
    console.log(user)
  }

  handleSetUser = (userResult) => {
    const { user } = userResult
    this.setState({ user })
  }

  handleResetState = (lastUsedUsername) => {
    this.setState({
      lastUsedUsername,
      user: undefined,
      mode: undefined
    })
    window.location.hash = 'sign-in'
  }

  handleUpdateUser = (user) => {
    this.setState({ user })
  }

  getDefaultSignedInMode = () => {
    return this.setState({ mode: hasCreatedInvoice() ? 'dashboard': 'invoices' })
  }

  handleReadHash = () => {
    const { user } = this.state
    const signedIn = !!user

    const hashRoute = window.location.hash.substring(1)

    switch (hashRoute) {
      case 'sign-up':
      case 'sign-in':
        // if user is signed in already, re-route to default
        return signedIn ? window.location.hash = '' : this.setState({ mode: hashRoute })

      case 'dashboard':
      case 'invoices':
      case 'customers':
      case 'new-invoice':
      case 'account':
        return signedIn ? this.setState({ mode: hashRoute }) : window.location.hash = 'sign-in'

      default: {
        if (signedIn && hashRoute === '') {
          // default mode when user is signed in
          return this.getDefaultSignedInMode()
        } else if (signedIn) {
          // user is signed in but on a route other than '', so re-route to ''
          return window.location.hash = ''
        } else {
          return window.location.hash = 'sign-in'
        }
      }
    }
  }

  handleDownloadData = () => {}

  handleImportData = () => {
    const fileExtension = navigator.userAgent.match('CriOS')
      ? '' // accept any file type for Chrome iOS given issue in downloadFileLocally
      : '.db'

    importFile(fileExtension, this.handleImportedFile)
  }

  handleImportedFile = async (file) => {
    const { restoringFromBackupFile, user } = this.state
    if (restoringFromBackupFile) return

    this.setState({ restoringFromBackupFile: true })

    try {
      await restoreFromBackupFile(file, user.userId)
      this.setState({ restoringFromBackupFile: false })
    } catch (e) {
      window.alert(`Failed to restore from backup: ${e.message}`)
      this.setState({ restoringFromBackupFile: false })
    }
  }

  render() {
    const {
      user,
      lastUsedUsername,
      mode
    } = this.state

    const loading = mode === undefined

    return (
      <div>
        { loading &&
          <div className='centered' style={{ top: '40%', width: '40%' }}><div className='loader'></div></div>
        }

        { (user && mode !== 'new-invoice') &&
          <NavBar
            key={'NavBar' + mode} // re-renders on mode change
            mode={mode}
            user={user}
            handleDownloadData={this.handleDownloadData}
            handleImportData={this.handleImportData}
            handleResetState={this.handleResetState}
          />
        }

        { mode && (() => {
          switch (mode) {
            case 'sign-up':
            case 'sign-in':
              return <UserForm
                key={'UserForm' + mode} // re-renders on mode change
                mode={mode}
                lastUsedUsername={mode === 'sign-in' ? lastUsedUsername : ''}
                handleSignIn={this.handleSignIn}
              />

            case 'new-invoice':
              return <NewInvoiceForm
                user={user}
              />

            case 'invoices':
              return <InvoicesDashboard
                key={Math.random()} // re-renders on change to sqlJsDb
                user={user}
              />

            case 'customers':
              return <CustomersDashboard
                key={Math.random()} // re-renders on change to sqlJsDb
                user={user}
              />

            case 'account':
              return <Account
                user={user}
                handleResetState={this.handleResetState}
              />

            case 'dashboard':
            default:
              return <Dashboard
                key={Math.random()} // re-renders on change to sqlJsDb
                user={user}
              />
          }
        })()}
      </div>
    )
  }
}

export default App
