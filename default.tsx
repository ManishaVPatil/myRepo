/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from 'react';
import { Modal, Text } from '@vds/core';
import { isValidKeyDownKeys } from '@/helpers/keyboardUtils';
import { AddPaymentMethodModalProps } from '../common/types';
import AddPaymentMethodModalCardInformation from '../common/components/CardInformation';
import AddPaymentMethodModalBillingInformation from '../common/components/BillingInformation';
import { useManageAutoRefillContext } from '@/store/contexts/accountManagement/manageAutoRefillContext';
import { getGtmData } from '@/helpers/gtmHelper';
import { getTrackingVariables } from '@/helpers/trackingUtils';
import { trackCTAClick, trackPageView, trackLinkClick } from '@/helpers/tealium';
import { fetchCityStateDetailFromZipCode } from '@/store/sagas/clientApi/mapquest';
import { detectCardBrand, isExpiryDateExpired, isValidEmailFormat } from '@/helpers/formFieldValidation';

interface PaymentFormData {
  firstName: string;
  lastName: string;
  cardNumber: string;
  expiryDate: string;
  cvv: string;
  nickname: string;
  isPrimary: boolean | string;
  address: string;
  suite: string;
  country: string;
  zipCode: string;
  city: string;
  state: string;
  phone: string;
  email: string;
  [key: string]: any;
}

const AddPaymentMethodModalDefault = (args: AddPaymentMethodModalProps) => {
  const isCardInfoValid = () => {
    const cardNumberDigits = (formData.cardNumber || '').replace(/[^0-9]/g, '');
    const expiryFormatted = (formData.expiryDate || '').trim();
    const cvvDigits = (formData.cvv || '').replace(/[^0-9]/g, '');
    const cardBrand = detectCardBrand(formData.cardNumber || '');
    
    const isCvvValid = cvvDigits.length === cardBrand.cvvLength;
    const isCardNumberValid = cardBrand.validLengths.includes(cardNumberDigits.length);
    const isExpiryValid = expiryFormatted.length === 5 && !isExpiryDateExpired(expiryFormatted);

    return !!formData.firstName && !!formData.lastName && isCardNumberValid && isExpiryValid && isCvvValid;
  };

  const isBillingInfoValid = () => {
    const phoneDigits = (formData.phone || '').replace(/\D/g, '');
    const isPhoneValid = phoneDigits.length === 10;
    const zipcodeDigits = (formData.zipCode || '').replace(/\D/g, '');
    const isZipcodeValid = zipcodeDigits.length === 5;

    // This will return FALSE if the child sets the email to "API_FAILED_INVALID_EMAIL"
    const isEmailFormatValid = isValidEmailFormat(formData.email || '');

    const isValid = !!formData.address &&
      !!formData.country &&
      isZipcodeValid &&
      !!formData.city &&
      !!formData.state &&
      isPhoneValid &&
      isEmailFormatValid;

    console.log(`[PARENT VALIDATION] Email is: "${formData.email}" | Is Email Valid? ${isEmailFormatValid} | Form Valid? ${isValid}`);
    return isValid;
  };

  const { opened, onClose, onSubmit, isSubmitting = false } = args;
  const { tealiumData, gtmData } = useManageAutoRefillContext();
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<PaymentFormData>({
    firstName: '', lastName: '', cardNumber: '', expiryDate: '', cvv: '', nickname: '',
    isPrimary: false, address: '', suite: '', country: '', zipCode: '', city: '', state: '', phone: '', email: '',
  });

  const modals = (args?.modals ?? {}) as Record<string, any>;
  const addPaymentMethod = modals['add_payment_method'] ?? {};
  const section = addPaymentMethod?.content?.section || [];
  const modalTitle = addPaymentMethod?.title;

  const cardInfoSection = section.find((s: any) => s.id === 'provide_card_information');
  const billingInfoSection = section.find((s: any) => s.id === 'billing_information');

  useEffect(() => {
    if (!opened) {
      setCurrentStep(0);
      setFormData({
        firstName: '', lastName: '', cardNumber: '', expiryDate: '', cvv: '', nickname: '',
        isPrimary: false, address: '', suite: '', country: '', zipCode: '', city: '', state: '', phone: '', email: '',
      });
    }
  }, [opened]);

  useEffect(() => {
    if (addPaymentMethod) {
      trackPageView({
        ...getTrackingVariables(),
        description: 'Add payment method modal opened on autopay page',
        pageName: 'add_payment_method_pop_up_modal',
      });
    }
  }, [addPaymentMethod]);

  const handleInputChange = async (fieldName: string, value: string | boolean) => {
    setFormData((prev) => ({
      ...prev,
      [fieldName]: value,
    }));

    if (fieldName === 'zipCode' && typeof value === 'string' && value.length === 5) {
      try {
        const response = await fetchCityStateDetailFromZipCode(value);

        if (response && !response.error) {
          const stateValue = response.state || '';
          const billingSections = billingInfoSection?.content?.section || [];
          const countrySection = billingSections.find((s: any) => s.id === 'country');
          const countryDropdownOptions = countrySection?.dropdown?.options || [];

          const countryFromMapQuest = response.country || 'United States';
          const matchingCountryOption = countryDropdownOptions.find(
            (option: any) => 
              option.name?.toLowerCase() === countryFromMapQuest.toLowerCase() ||
              option.value?.toLowerCase() === countryFromMapQuest.toLowerCase()
          );
          const countryValue = matchingCountryOption ? matchingCountryOption.value : countryFromMapQuest;

          setFormData((prev) => ({
            ...prev,
            city: response.city || '',
            state: stateValue, 
            country: countryValue, 
            zipCode: response.zip_code || value,
          }));
        }
      } catch (error) {
        console.error('Error fetching city and state from zipcode:', error);
      }
    }
  };

  const handleContinue = () => {
    trackCTAClick(tealiumData, cardInfoSection?.cta?.id, cardInfoSection?.cta?.text);
    if (currentStep === 0) {
      setCurrentStep(1);
    }
  };

  const handleSubmit = () => {
    trackCTAClick(tealiumData, billingInfoSection?.cta?.id, billingInfoSection?.cta?.text);
    if (typeof onSubmit === 'function') {
      onSubmit({
        ...formData,
        type: formData.type as string,
      });
    }
  };

  const cardInfoDisabled = !isCardInfoValid();
  const billingInfoDisabled = !isBillingInfoValid() || isSubmitting;

  const buttonGroup = currentStep === 0 && cardInfoSection?.cta
    ? {
        items: [{
          ...cardInfoSection.cta,
          children: cardInfoSection.cta.text,
          label: cardInfoDisabled && cardInfoSection.cta?.accessibility?.disabledLabel
            ? cardInfoSection.cta.accessibility.disabledLabel
            : cardInfoSection.cta.text,
          kind: cardInfoSection.cta.style || 'primary',
          disabled: cardInfoDisabled,
          onClick: () => handleContinue(),
          onKeyDown: (e: React.KeyboardEvent) => {
            if (isValidKeyDownKeys(e.nativeEvent as KeyboardEvent) && isCardInfoValid()) handleContinue();
          },
          'data-tealium-id': cardInfoSection.cta.id,
          ...getGtmData(gtmData, cardInfoSection.cta.id),
        }],
        rowQuantity: { mobile: 1, desktop: 1 },
      }
    : currentStep === 1 && billingInfoSection?.cta
    ? {
        items: [
          {
            ...billingInfoSection.cta,
            children: billingInfoSection.cta.text,
            label: billingInfoDisabled && billingInfoSection.cta?.accessibility?.disabledLabel
              ? billingInfoSection.cta.accessibility.disabledLabel
              : billingInfoSection.cta.text,
            kind: billingInfoSection.cta.style || 'primary',
            disabled: billingInfoDisabled,
            onClick: () => handleSubmit(),
            onKeyDown: (e: React.KeyboardEvent) => {
              if (isValidKeyDownKeys(e.nativeEvent as KeyboardEvent) && !billingInfoDisabled) handleSubmit();
            },
            'data-tealium-id': billingInfoSection.cta.id,
            ...getGtmData(gtmData, billingInfoSection.cta.id),
          }
        ],
        rowQuantity: { mobile: 1, desktop: 1 },
      }
    : undefined;

  return (
    <Modal
      height='auto'
      maxHeight='100vh'
      opened={opened}
      onOpenedChange={(isOpen: boolean) => {
        if (!isOpen) onClose();
      }}
      closeButton={{
        onClick: () => {
          const trackingData = {
            event: 'add_payment_method:close_button',
            description: 'Close button on add payment method modal',
            pageName: 'add_payment_method_pop_up_modal',
            linkLocation: addPaymentMethod.closeButton?.id,
            linkType: 'button',
            flowName: 'autopay'
          };
          setTimeout(() => trackLinkClick(trackingData), 0);
          onClose();
        },
        ...getGtmData(gtmData, addPaymentMethod.closeButton?.id),
      }}
      title={{
        children: modalTitle,
        size: 'medium',
        bold: true,
        primitive: 'h2',
      }}
      ariaLabel={modalTitle}
      buttonGroup={buttonGroup}
      disableOutsideClick
    >
      <div className='add-payment-modal__content-form'>
        {currentStep === 0 && cardInfoSection && (
          <AddPaymentMethodModalCardInformation
            title={cardInfoSection.title}
            images={cardInfoSection.images}
            content={cardInfoSection.content}
            footer={cardInfoSection.footer}
            formData={formData}
            onInputChange={handleInputChange}
            tealiumData={tealiumData}
            gtmData={gtmData}
          />
        )}
        {currentStep === 1 && billingInfoSection && (
          <AddPaymentMethodModalBillingInformation
            title={billingInfoSection.title}
            body={billingInfoSection.body}
            content={billingInfoSection.content}
            formData={formData}
            onInputChange={handleInputChange}
          />
        )}
      </div>
    </Modal>
  );
};

export default AddPaymentMethodModalDefault;