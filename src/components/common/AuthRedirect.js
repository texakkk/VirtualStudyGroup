import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';

const AuthRedirect = () => {
  const { redirectPath, clearRedirect } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (redirectPath) {
      navigate(redirectPath);
      clearRedirect();
    }
  }, [redirectPath, navigate, clearRedirect]);

  return null;
};

export default AuthRedirect;
