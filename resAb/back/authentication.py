from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.tokens import AccessToken
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from .models import Users


class CustomJWTAuthentication(BaseAuthentication):
    def authenticate(self, request):
        auth = request.headers.get('Authorization', '')
        if not auth.startswith('Bearer '):
            return None
        token_str = auth.split(' ', 1)[1]
        try:
            token = AccessToken(token_str)
            user = Users.objects.get(pk=token['user_id'])
            return (user, token)
        except (InvalidToken, TokenError):
            raise AuthenticationFailed('Token inválido o expirado')
        except Users.DoesNotExist:
            raise AuthenticationFailed('Usuario no encontrado')
