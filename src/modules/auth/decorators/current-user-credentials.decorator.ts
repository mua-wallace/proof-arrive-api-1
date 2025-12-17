import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Credentials } from '@common/interfaces';

export const CurrentUserCredentials = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): Credentials => {
    const request = ctx.switchToHttp().getRequest();
    
    if (!request.user) {
      throw new Error('User credentials not found in request');
    }

    // Handle both structures:
    // 1. Middleware structure: { acc_id, acc_token, acc_sid, session }
    // 2. JWT payload structure: { token, accid, subid, iat, exp }
    const user = request.user as any;
    
    // Check if it's JWT payload structure (has 'token' and 'accid' directly)
    let token: string;
    let accid: number;
    let subid: number;
    let session: string = '';

    if (user.token && user.accid !== undefined && user.subid !== undefined) {
      // JWT payload structure
      token = user.token;
      accid = typeof user.accid === 'number' ? user.accid : Number(user.accid);
      subid = typeof user.subid === 'number' ? user.subid : Number(user.subid);
      session = user.session || '';
    } else if (user.acc_token && user.acc_id !== undefined && user.acc_sid !== undefined) {
      // Middleware structure
      token = user.acc_token;
      accid = typeof user.acc_id === 'number' ? user.acc_id : Number(user.acc_id);
      subid = typeof user.acc_sid === 'number' ? user.acc_sid : Number(user.acc_sid);
      session = user.session || '';
    } else {
      throw new Error('Invalid user credentials structure in request');
    }

    // Validate converted values
    if (!token || isNaN(accid) || isNaN(subid)) {
      throw new Error('Invalid token or account IDs in user credentials');
    }

    const credentials: Credentials = {
      token,
      accid,
      subid,
      session,
    };
    
    return credentials;
  },
);

