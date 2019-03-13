// @flow
import React, { Component } from 'react';
import { observer } from 'mobx-react';
import classnames from 'classnames';
import { defineMessages, intlShape } from 'react-intl';
// import { Input } from 'react-polymorph/lib/components/Input';
// import { Checkbox } from 'react-polymorph/lib/components/Checkbox';
// import { InputSkin } from 'react-polymorph/lib/skins/simple/InputSkin';
// import { SwitchSkin } from 'react-polymorph/lib/skins/simple/SwitchSkin';
// import { IDENTIFIERS } from 'react-polymorph/lib/themes/API';
import DialogCloseButton from '../../widgets/DialogCloseButton';
import Dialog from '../../widgets/Dialog';
import ReactToolboxMobxForm from '../../../utils/ReactToolboxMobxForm';
import FileUploadWidget from '../../widgets/forms/FileUploadWidget';
import {
  isValidWalletName,
  isValidSpendingPassword,
  isValidRepeatPassword,
} from '../../../utils/validations';
import globalMessages from '../../../i18n/global-messages';
import LocalizableError from '../../../i18n/LocalizableError';
import styles from './WalletFileImportDialog.scss';
import { FORM_VALIDATION_DEBOUNCE_WAIT } from '../../../config/timingConfig';

const messages = defineMessages({
  headline: {
    id: 'wallet.file.import.dialog.headline',
    defaultMessage: '!!!Import Wallet',
    description: 'headline for "Import wallet from file" dialog.',
  },
  walletFileLabel: {
    id: 'wallet.file.import.dialog.walletFileLabel',
    defaultMessage: '!!!Import file',
    description:
      'Label "Import file" on the dialog for importing a wallet from a file.',
  },
  walletFileHint: {
    id: 'wallet.file.import.dialog.walletFileHint',
    defaultMessage: '!!!Drop file here or click to choose',
    description:
      'Hint for the file upload field on the dialog for importing a wallet from a file.',
  },
  walletNameInputLabel: {
    id: 'wallet.file.import.dialog.wallet.name.input.label',
    defaultMessage: '!!!Wallet name',
    description:
      'Label for the "wallet name" input in the wallet file import dialog.',
  },
  walletNameInputHint: {
    id: 'wallet.file.import.dialog.wallet.name.input.hint',
    defaultMessage: '!!!e.g: Shopping Wallet',
    description: 'Hint for the "Wallet name" in the wallet file import dialog.',
  },
  submitLabel: {
    id: 'wallet.file.import.dialog.submitLabel',
    defaultMessage: '!!!Import wallet',
    description:
      'Label "Import wallet" submit button on the dialog for importing a wallet from a file.',
  },
  passwordSwitchPlaceholder: {
    id: 'wallet.file.import.dialog.passwordSwitchPlaceholder',
    defaultMessage: '!!!Activate to create password',
    description:
      'Text for the "Activate to create password" switch in the wallet file import dialog.',
  },
  passwordSwitchLabel: {
    id: 'wallet.file.import.dialog.passwordSwitchLabel',
    defaultMessage: '!!!Password',
    description:
      'Label for the "Activate to create password" switch in the wallet file import dialog.',
  },
  spendingPasswordLabel: {
    id: 'wallet.file.import.dialog.spendingPasswordLabel',
    defaultMessage: '!!!Wallet password',
    description:
      'Label for the "Wallet password" input in the wallet file import dialog.',
  },
  repeatPasswordLabel: {
    id: 'wallet.file.import.dialog.repeatPasswordLabel',
    defaultMessage: '!!!Repeat password',
    description:
      'Label for the "Repeat password" input in the wallet file import dialog.',
  },
  passwordFieldPlaceholder: {
    id: 'wallet.file.import.dialog.passwordFieldPlaceholder',
    defaultMessage: '!!!Password',
    description:
      'Placeholder for the "Password" inputs in the wallet file import dialog.',
  },
});

type Props = {
  onSubmit: Function,
  onClose: Function,
  isSubmitting: boolean,
  error: ?LocalizableError,
};

type State = {
  createPassword: boolean,
};

@observer
export default class WalletFileImportDialog extends Component<Props, State> {
  state = {
    createPassword: false,
  };

  static contextTypes = {
    intl: intlShape.isRequired,
  };

  handlePasswordSwitchToggle = (value: boolean) => {
    this.setState({ createPassword: value });
  };

  form = new ReactToolboxMobxForm(
    {
      fields: {
        walletFile: {
          label: this.context.intl.formatMessage(messages.walletFileLabel),
          placeholder: this.context.intl.formatMessage(messages.walletFileHint),
          type: 'file',
        },
        walletName: {
          label: this.context.intl.formatMessage(messages.walletNameInputLabel),
          placeholder: this.context.intl.formatMessage(
            messages.walletNameInputHint
          ),
          value: '',
          validators: [
            ({ field }) => {
              if (field.value.length === 0) return [true];
              return [
                isValidWalletName(field.value),
                this.context.intl.formatMessage(
                  globalMessages.invalidWalletName
                ),
              ];
            },
          ],
        },
        spendingPassword: {
          type: 'password',
          label: this.context.intl.formatMessage(
            messages.spendingPasswordLabel
          ),
          placeholder: this.context.intl.formatMessage(
            messages.passwordFieldPlaceholder
          ),
          value: '',
          validators: [
            ({ field, form }) => {
              if (!this.state.createPassword) return [true];
              const repeatPasswordField = form.$('repeatPassword');
              if (repeatPasswordField.value.length > 0) {
                repeatPasswordField.validate({ showErrors: true });
              }
              return [
                isValidSpendingPassword(field.value),
                this.context.intl.formatMessage(
                  globalMessages.invalidSpendingPassword
                ),
              ];
            },
          ],
        },
        repeatPassword: {
          type: 'password',
          label: this.context.intl.formatMessage(messages.repeatPasswordLabel),
          placeholder: this.context.intl.formatMessage(
            messages.passwordFieldPlaceholder
          ),
          value: '',
          validators: [
            ({ field, form }) => {
              if (!this.state.createPassword) return [true];
              const spendingPassword = form.$('spendingPassword').value;
              if (spendingPassword.length === 0) return [true];
              return [
                isValidRepeatPassword(spendingPassword, field.value),
                this.context.intl.formatMessage(
                  globalMessages.invalidRepeatPassword
                ),
              ];
            },
          ],
        },
      },
    },
    {
      options: {
        validateOnChange: true,
        validationDebounceWait: FORM_VALIDATION_DEBOUNCE_WAIT,
      },
    }
  );

  submit = () => {
    this.form.submit({
      onSuccess: form => {
        const { createPassword } = this.state;
        const { walletFile, spendingPassword, walletName } = form.values();
        const walletData = {
          filePath: walletFile.path,
          spendingPassword: createPassword ? spendingPassword : null,
          walletName: walletName.length > 0 ? walletName : null,
        };
        this.props.onSubmit(walletData);
      },
      onError: () => {},
    });
  };

  render() {
    const { intl } = this.context;
    const { form } = this;
    const { isSubmitting, error, onClose } = this.props;
    // const { createPassword } = this.state;

    const walletFile = form.$('walletFile');
    const dialogClasses = classnames([
      styles.component,
      'WalletFileImportDialog',
    ]);

    // const spendingPasswordFieldsClasses = classnames([
    //   styles.spendingPasswordFields,
    //   createPassword ? styles.show : null,
    // ]);

    const actions = [
      {
        className: isSubmitting ? styles.isSubmitting : null,
        label: intl.formatMessage(messages.submitLabel),
        primary: true,
        disabled: isSubmitting || !(walletFile.value instanceof File),
        onClick: this.submit,
      },
    ];

    // const walletNameField = form.$('walletName');
    // const spendingPasswordField = form.$('spendingPassword');
    // const repeatedPasswordField = form.$('repeatPassword');

    return (
      <Dialog
        className={dialogClasses}
        title={intl.formatMessage(messages.headline)}
        actions={actions}
        closeOnOverlayClick
        onClose={onClose}
        closeButton={<DialogCloseButton />}
      >
        <div className={styles.fileUpload}>
          <FileUploadWidget
            {...walletFile.bind()}
            selectedFile={walletFile.value}
            onFileSelected={file => {
              // "set(value)" is an unbound method and thus must be explicitly called
              walletFile.set(file);
            }}
          />
        </div>

        {/* TODO: re-enable when wallet-name and wallet-password
            support is added to the API endpoint

          <Input
            className="walletName"
            {...walletNameField.bind()}
            error={walletNameField.error}
            skin={InputSkin}
          />

          <div className={styles.spendingPassword}>
            <div className={styles.spendingPasswordSwitch}>
              <div className={styles.passwordLabel}>
                {intl.formatMessage(messages.passwordSwitchLabel)}
              </div>
              <Checkbox
                themeId={IDENTIFIERS.SWITCH}
                onChange={this.handlePasswordSwitchToggle}
                label={intl.formatMessage(messages.passwordSwitchPlaceholder)}
                checked={createPassword}
                skin={SwitchSkin}
              />
            </div>

            <div className={spendingPasswordFieldsClasses}>
              <Input
                className="spendingPassword"
                {...spendingPasswordField.bind()}
                error={spendingPasswordField.error}
                skin={InputSkin}
              />
              <Input
                className="repeatedPassword"
                {...repeatedPasswordField.bind()}
                error={repeatedPasswordField.error}
                skin={InputSkin}
              />
              <p className={styles.passwordInstructions}>
                {intl.formatMessage(globalMessages.passwordInstructions)}
              </p>
            </div>
          </div>
        */}

        {error && <p className={styles.error}>{intl.formatMessage(error)}</p>}
      </Dialog>
    );
  }
}
