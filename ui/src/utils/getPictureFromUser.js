/**
 * Given a user profile, return a picture if any.
 */
export default user => {
  if (!user) {
    return null;
  }

  switch (user.providerId) {
    // A profile returned from mozilla auth0
    case 'mozilla-auth0': {
      return user.profile.picture;
    }

    // A profile returned from passportjs.
    // http://www.passportjs.org/docs/profile/
    case 'github': {
      return user.profile.photos && user.profile.photos.length
        ? user.profile.photos[0].value
        : null;
    }

    default: {
      return null;
    }
  }
};