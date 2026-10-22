from argon2 import PasswordHasher
from typing import Dict


""" Given the username and passphrase, validate all information to grant user access

    args:
        username (str)  -> Users username for logging into DB
        passphrase (str)-> Users raw passphrase for logging into DB
    
    rets:
        Dict[str, str]  -> Returns dictionary with keys 'status' and 'reason'
            Status      -> Valid if success, Invalid otherwise
"""
def check_auth(
    username:   str,
    passphrase: str
) -> Dict[str, str]:
    ph = PasswordHasher()

    # Check username is in DB
    try:
        # TODO: Check if username is in database
        pass
    except Exception:
        return {
            'status': 'invalid',
            'reason': 'user not in database'
        }

    # Check for valid password
    try:
        #TODO: 
        ph.verify(hash, passphrase)
        if ph.check_needs_rehash(hash):
            hash = ph.hash(passphrase)
    except Exception:
        return {
            'status': 'invalid',
            'reason': 'invalid passphrase'
        }

    return {
        'status': 'valid',
        'reason': 'success, user is authorized.'
    }


"""Given the username and passphrase, register a user to be entered in the DB

    args:
        username (str)  -> The desired username of the user
        passphrase (str)-> The desiered passphrase of the user

    rets:
        Dict[str, str]  -> Returns dictionary with keys 'status' and 'reason'
            Status      -> Valid if success, Invalid otherwise
"""
def register_user(
    username:   str,
    passphrase: str
) -> Dict[str, str]:
    ph = PasswordHasher()
    hash = ph.hash(passphrase)

    # TODO: Store username, hash into DB users table