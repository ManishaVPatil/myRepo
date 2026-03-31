/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, useRef } from 'react';
import { Input } from '@vds/core';
import { AddPaymentMethodModalBillingInformationEmailProps } from '../common/types';
import { isValidEmailFormat } from '@/helpers/formFieldValidation';
import { checkIsValidEmail } from '@/store/sagas/clientApi/CreateAccount/createAccount';
import { apiResponse, errorMessages } from '@/helpers/utilities/constants';
import { logger } from '@/store/sagas/clientApi/logger';

const AddPaymentMethodModalBillingInformationEmailDefault = (args: AddPaymentMethodModalBillingInformationEmailProps) => {
  const { details, formData, onInputChange } = args;
  const input = details?.input;
  
  const [touched, setTouched] = useState(false);
  const [apiError, setApiError] = useState<string>('');
  const [isEmailValidating, setIsEmailValidating] = useState<boolean>(false);
  
  // Local state so the user's input isn't overridden by the hack
  const [localEmail, setLocalEmail] = useState(formData.email || '');

  const emailValidationAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      emailValidationAbortRef.current?.abort();
    };
  }, []);

  // If the modal resets, clear the local state
  useEffect(() => {
    if (formData.email === '') {
      setLocalEmail('');
      setApiError('');
      setTouched(false);
    }
  }, [formData.email]);

  const isValidEmail = isValidEmailFormat(localEmail);
  const showError = touched && localEmail.length > 0 && !isValidEmail;

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLocalEmail(val);
    
    // Sync to parent so validation can re-run
    onInputChange('email', val);
    
    if (apiError) setApiError('');
  };

  const handleBlur = async () => {
    setTouched(true);
    console.log('[EMAIL CHILD] Blur triggered. Local value:', localEmail);

    if (localEmail !== '' && isValidEmail) {
      emailValidationAbortRef.current?.abort();
      const controller = new AbortController();
      emailValidationAbortRef.current = controller;

      setIsEmailValidating(true);
      
      // 🚨 STRATEGY: Send an invalid email string to parent so the button disables while validating
      console.log('[EMAIL CHILD] Validating... Disabling parent button.');
      onInputChange('email', 'VALIDATING_API_STATE'); 
      
      try {
        const response = await checkIsValidEmail('', localEmail);
        if (controller.signal.aborted) return;

        const responseStatus = response?.status || response?.body?.status;

        if (responseStatus?.type === apiResponse.error || responseStatus?.type === 'ERROR') {
          const errorMessage = input?.errorMessages?.[errorMessages.error] || responseStatus?.message || input?.errorMessages?.[errorMessages.invalid] || '';
          setApiError(errorMessage);
          
          // 🚨 THE FIX: Send a totally broken string. Parent's regex will fail, button will disable!
          console.log('[EMAIL CHILD] API ERROR! Forcing parent email state to invalid string.');
          onInputChange('email', 'API_FAILED_INVALID_EMAIL'); 
        } else {
          // ✅ Success: Restore the real email in the parent so the button enables
          console.log('[EMAIL CHILD] API SUCCESS! Restoring clean email to parent.');
          onInputChange('email', localEmail);
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        logger({ logData: ['checkIsValidEmail', error], logType: 'ERROR', logEventType: 'API_ERROR' });
        
        setApiError(input?.errorMessages?.[errorMessages.genericError] || 'Error validating email');
        
        console.log('[EMAIL CHILD] API CATCH BLOCK! Forcing parent email state to invalid string.');
        onInputChange('email', 'API_FAILED_INVALID_EMAIL'); 
      } finally {
        if (!controller.signal.aborted) {
          setIsEmailValidating(false);
        }
      }
    }
  };

  return (
    <div className="add-payment-modal__input-data">
      <Input
        type="email"
        label={input?.label}
        placeholder={input?.placeholder || ''}
        value={localEmail}
        onChange={handleEmailChange}
        onBlur={handleBlur} 
        required={input?.required}
        aria-label={input?.accessibility?.['aria-label']}
        error={showError || !!apiError} 
        errorText={apiError || (showError ? input?.errorMessages?.[errorMessages.invalid] : undefined)} 
      />
      {isEmailValidating && (
        <div aria-live="polite" data-testid="loading-indicator" className="add-payment-modal__email-loading">Validating...</div>
      )}
    </div>
  );
};

export default AddPaymentMethodModalBillingInformationEmailDefault;
