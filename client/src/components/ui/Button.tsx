import React from 'react';

type Variant = 'default' | 'primary' | 'danger' | 'ghost';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const variantClass: Record<Variant, string> = {
  default: '',
  primary: 'mm-btn--primary',
  danger: 'mm-btn--danger',
  ghost: 'mm-btn--ghost',
};

const Button: React.FC<ButtonProps> = ({ variant = 'default', className = '', ...rest }) => (
  <button className={`mm-btn ${variantClass[variant]} ${className}`.trim()} {...rest} />
);

export default Button;
